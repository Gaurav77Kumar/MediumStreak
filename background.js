/* Background service worker: aggregates reading time, keeps the badge current,
handles the midnight rollover (streak freeze earn/spend), the optional
evening reminder, and milestone badge checks.
*/
importScripts("lib/streak.js", "lib/badges.js");

const DEFAULT_SETTINGS = {
  dailyGoalMin: 10, 
  minArticleMin: 3, 
  reminderEnabled: false,
  reminderHour: 20, 
  digestEnabled: true,
  digestDay: 0, 
  digestHour: 18, 
  sites: [], 
};
const BUILTIN_SITES = [
  "medium.com",
];
const MAX_ARTICLES = 1000;
let mutationQueue = Promise.resolve();

function enqueueMutation(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.catch(() => {});
  return run;
}

function boundedSetting(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

function normalizeSettings(raw) {
  const settings = raw && typeof raw === "object" ? raw : {};
  return {
    dailyGoalMin: boundedSetting(settings.dailyGoalMin, DEFAULT_SETTINGS.dailyGoalMin, 1, 240),
    minArticleMin: boundedSetting(settings.minArticleMin, DEFAULT_SETTINGS.minArticleMin, 1, 60),
    reminderEnabled: settings.reminderEnabled === true,
    reminderHour: boundedSetting(settings.reminderHour, DEFAULT_SETTINGS.reminderHour, 0, 23),
    digestEnabled: typeof settings.digestEnabled === "boolean" ? settings.digestEnabled : DEFAULT_SETTINGS.digestEnabled,
    digestDay: boundedSetting(settings.digestDay, DEFAULT_SETTINGS.digestDay, 0, 6),
    digestHour: boundedSetting(settings.digestHour, DEFAULT_SETTINGS.digestHour, 0, 23),
    sites: Array.isArray(settings.sites) ? settings.sites.filter((site) => typeof site === "string") : [],
  };
}

async function getStore() {
  const {
    days = {},
    articles = [],
    settings = {},
    freeze = {
      count: 0,
      earned: 0
    },
    badges = {}
  } = await chrome.storage.local.get(["days", "articles", "settings", "freeze", "badges"]);
  return {
    days,
    articles,
    settings: normalizeSettings(settings),
    freeze,
    badges,
  };
}

function articleIsCounted(article, settings) {
  return typeof article.counted === "boolean"
    ? article.counted
    : article.seconds >= (article.minArticleMin || settings.minArticleMin) * 60;
}

function totalWordsRead(articles, settings) {
  return articles.reduce((n, article) => (articleIsCounted(article, settings) ? n + (article.words || 0) : n), 0);
}

// New badge unlocks are checked on every reading tick and at the daily
// rollover — badges are derived purely from stats, so this stays cheap.
async function checkBadges() {
  const store = await getStore();
  const stats = {
    ...computeStats(store.days, store.settings),
    totalWords: totalWordsRead(store.articles, store.settings),
  };
  const newly = newlyEarnedBadges(store.badges, stats);
  if (newly.length === 0) return;

  for (const b of newly) store.badges[b.id] = localDateKey();
  await chrome.storage.local.set({ badges: store.badges });
  const last = newly[newly.length - 1];
  notify(
    `${last.icon} Badge unlocked: ${last.name}`,
    newly.length > 1 ? `${newly.length} new badges — including "${last.desc}"!` : `Milestone reached: ${last.desc}.`
  );
}

async function handleReadingTick({ seconds, url, title, words, topics }, sender) {
  if (!seconds || seconds <= 0 || !url) return;
  const store = await getStore();
  const today = localDateKey();

  const day = store.days[today] || { minutes: 0, articles: 0, goalMin: store.settings.dailyGoalMin };
  const prevMinutes = day.minutes;
  day.goalMin = store.settings.dailyGoalMin;
  day.minutes = Math.round((day.minutes + seconds / 60) * 100) / 100;

  let entry = store.articles.find((a) => a.url === url && a.date === today);
  if (entry) {
    if (entry.minArticleMin === undefined) entry.minArticleMin = store.settings.minArticleMin;
    if (entry.counted === undefined) entry.counted = entry.seconds >= entry.minArticleMin * 60;
  } else {
    entry = {
      url,
      title,
      date: today,
      seconds: 0,
      lastRead: Date.now(),
      minArticleMin: store.settings.minArticleMin,
      counted: false,
    };
    store.articles.push(entry);
  }
  entry.seconds += seconds;
  entry.lastRead = Date.now();
  if (title) entry.title = title;
  if (words) entry.words = Math.max(entry.words || 0, words);
  if (Array.isArray(topics) && topics.length) entry.topics = topics.slice(0, 5);

  if (!entry.counted && entry.seconds >= entry.minArticleMin * 60) {
    entry.counted = true;
  }
  day.articles = store.articles.filter((article) => article.date === today && articleIsCounted(article, store.settings)).length;

  store.days[today] = day;
  if (store.articles.length > MAX_ARTICLES) {
    const starred = store.articles.filter((a) => a.starred);
    const room = Math.max(0, MAX_ARTICLES - starred.length);
    const others = store.articles
      .filter((a) => !a.starred)
      .sort((a, b) => (b.lastRead || Date.parse(`${b.date}T00:00:00`) || 0) - (a.lastRead || Date.parse(`${a.date}T00:00:00`) || 0))
      .slice(0, room);
    store.articles = starred.concat(others);
  }

  await chrome.storage.local.set({ days: store.days, articles: store.articles });
  await updateBadge();
  await checkBadges();

  // Goal crossed mid-read: celebrate once per day, in the tab that did it.
  const goal = store.settings.dailyGoalMin;
  if (
    prevMinutes < goal &&
    day.minutes >= goal &&
    sender && sender.tab && sender.tab.id
  ) {
    const { meta = {} } = await chrome.storage.local.get("meta");
    if (meta.lastCelebrated !== today) {
      meta.lastCelebrated = today;
      await chrome.storage.local.set({ meta });
      try {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: "streakSecured",
          minutes: Math.round(day.minutes),
          streak: computeStats(store.days, store.settings).currentStreak,
        });
      } catch (e) {
      }
    }
  }
}


async function updateBadge() {
  const store = await getStore();
  const stats = computeStats(store.days, store.settings);
  const todayActive = dayIsActive(store.days[localDateKey()], store.settings);
  const text = stats.currentStreak > 0 ? String(stats.currentStreak) : "";
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: todayActive ? "#26a641" : "#57606a" });
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
  });
}

function nextAt(hour, minute = 0) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target.getTime();
}

// Next occurrence of a given weekday (0 = Sunday) at hour:minute local time.
function nextDayAt(targetDay, hour, minute = 0) {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  let add = (targetDay - t.getDay() + 7) % 7;
  if (add === 0 && t <= now) add = 7;
  t.setDate(t.getDate() + add);
  return t.getTime();
}

async function ensureAlarms() {
  const store = await getStore();
  await chrome.alarms.create("dailyRollover", {
    when: nextAt(0, 5),
  });
  if (store.settings.reminderEnabled) {
    await chrome.alarms.create("eveningReminder", {
      when: nextAt(store.settings.reminderHour),
    });
  } else {
    await chrome.alarms.clear("eveningReminder");
  }
  if (store.settings.digestEnabled) {
    await chrome.alarms.create("weeklyDigest", {
      when: nextDayAt(store.settings.digestDay, store.settings.digestHour),
    });
  } else {
    await chrome.alarms.clear("weeklyDigest");
  }
}

function isValidDateKey(key) {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return localDateKey(parseDateKey(key)) === key;
}

async function handleRollover() {
  const store = await getStore();
  const { meta = {} } = await chrome.storage.local.get("meta");
  const endKey = localDateKey(addDays(new Date(), -1));
  const keys = Object.keys(store.days).filter(isValidDateKey).sort();
  let cursor;

  if (isValidDateKey(meta.lastRolloverDate)) {
    cursor = addDays(parseDateKey(meta.lastRolloverDate), 1);
  } else if (keys.length) {
    const latest = parseDateKey(keys[keys.length - 1]);
    cursor = latest >= parseDateKey(endKey) ? parseDateKey(endKey) : addDays(latest, 1);
  }

  while (cursor && localDateKey(cursor) <= endKey) {
    const key = localDateKey(cursor);
    const day = store.days[key];
    if (!dayIsActive(day, store.settings)) {
      if (store.freeze.count > 0) {
        store.freeze.count--;
        store.days[key] = { ...(day || {}), minutes: day?.minutes || 0, articles: day?.articles || 0, frozen: true };
        notify("Streak freeze used ❄️", `You missed ${key}, but a freeze saved your streak.`);
      }
    } else if (!day.frozen) {
      let streak = 0;
      let scan = cursor;
      while (dayIsActive(store.days[localDateKey(scan)], store.settings)) {
        streak++;
        scan = addDays(scan, -1);
      }
      if (streak > 0 && streak % 7 === 0 && meta.lastFreezeDate !== key) {
        store.freeze.earned++;
        store.freeze.count++;
        meta.lastFreezeDate = key;
        notify("Streak freeze earned ❄️", `${streak}-day streak! You banked one streak freeze.`);
      }
    }
    cursor = addDays(cursor, 1);
  }

  meta.lastRolloverDate = endKey;
  await chrome.storage.local.set({ days: store.days, freeze: store.freeze, meta });
  await updateBadge();
  await checkBadges();
  await ensureAlarms();
}

async function handleEveningReminder() {
  await ensureAlarms();
  const store = await getStore();
  if (!store.settings.reminderEnabled) return;
  const today = store.days[localDateKey()];
  if (dayIsActive(today, store.settings)) return;

  const stats = computeStats(store.days, store.settings);
  const done = Math.min(today ? today.minutes : 0, store.settings.dailyGoalMin);
  const left = Math.max(0, Math.round(store.settings.dailyGoalMin - done));
  notify(
    "Don't break the streak! 🔥",
    stats.currentStreak > 0
      ? `Your ${stats.currentStreak}-day streak needs ${left} more min of reading today.`
      : `${left} min of reading today starts a new streak.`
  );
}

// Weekly recap notification: last 7 days of reading, only if there was any.
async function handleWeeklyDigest() {
  await ensureAlarms();
  const store = await getStore();
  if (!store.settings.digestEnabled) return;

  let minutes = 0;
  let active = 0;
  for (let i = 0; i < 7; i++) {
    const e = store.days[localDateKey(addDays(new Date(), -i))];
    if (!e) continue;
    minutes += e.minutes || 0;
    if (dayIsActive(e, store.settings)) active++;
  }
  if (minutes <= 0) return; // don't ping inactive users

  const stats = computeStats(store.days, store.settings);
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  notify(
    "Weekly reading recap 📊",
    `You read ${h > 0 ? `${h}h ` : ""}${m}m across ${active} day${active === 1 ? "" : "s"} this week. Streak: ${stats.currentStreak} 🔥`
  );
}

/* Multi-site: inject the reader into user-added sites --
   Medium is matched statically in the manifest; extra sites get the reader
  injected programmatically once the user grants the host permission.
*/

function hostMatches(hostname, site) {
  return hostname === site || hostname.endsWith("." + site);
}

async function isTrackedHost(hostname) {
  if (BUILTIN_SITES.some((s) => hostMatches(hostname, s))) return true;
  const store = await getStore();
  return (store.settings.sites || []).some((s) => hostMatches(hostname, s));
}

async function injectReader(tabId) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content/celebrate.css"] });
  } catch (e) { /* tab may not accept CSS — keep going */ }
  try {
    // reader.js/celebrate.js self-guard against double injection.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/reader.js", "content/celebrate.js"],
    });
  } catch (e) { /* restricted frame or race with navigation — ignore */ }
  try {
    await chrome.tabs.sendMessage(tabId, { type: "enableTracking" });
  } catch (e) {
  }
}

function sitePermissionOrigins(site) {
  const origins = [`https://${site}/*`, `http://${site}/*`];
  if (site.includes(".") && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(site) && !site.startsWith("[")) {
    origins.push(`https://*.${site}/*`, `http://*.${site}/*`);
  }
  return origins;
}

async function openTabsForSite(site) {
  let tabs;
  try {
    tabs = await chrome.tabs.query({ url: sitePermissionOrigins(site) });
  } catch (e) {
    try {
      tabs = await chrome.tabs.query({});
    } catch (error) {
      return [];
    }
  }
  return tabs.filter((tab) => {
    if (!tab.url) return false;
    try {
      const url = new URL(tab.url);
      return (url.protocol === "https:" || url.protocol === "http:") && hostMatches(url.hostname, site);
    } catch (e) {
      return false;
    }
  });
}

async function injectIntoOpenTabs(site) {
  const tabs = await openTabsForSite(site);
  for (const tab of tabs) {
    if (tab.id) await injectReader(tab.id);
  }
}

async function disableSiteInOpenTabs(site) {
  const tabs = await openTabsForSite(site);
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "disableTracking" });
    } catch (e) {
    }
  }
}

async function saveSettingsPatch(settings) {
  const store = await getStore();
  await chrome.storage.local.set({ settings: { ...store.settings, ...(settings || {}) } });
  await ensureAlarms();
  await updateBadge();
}

async function toggleStoredStar(url, date) {
  const { articles = [] } = await chrome.storage.local.get("articles");
  const entry = articles.find((article) => article.url === url && article.date === date);
  if (entry) entry.starred = !entry.starred;
  await chrome.storage.local.set({ articles });
}

async function removeStoredReadLater(url) {
  const { readlater = [] } = await chrome.storage.local.get("readlater");
  await chrome.storage.local.set({ readlater: readlater.filter((item) => item.url !== url) });
}

async function markStoredReadLaterRead(url) {
  const { readlater = [] } = await chrome.storage.local.get("readlater");
  await chrome.storage.local.set({
    readlater: readlater.map((item) => item.url === url ? { ...item, completedAt: Date.now() } : item),
  });
}

async function addStoredSite(site) {
  const store = await getStore();
  const sites = [...(store.settings.sites || [])];
  if (!sites.includes(site)) sites.push(site);
  await chrome.storage.local.set({ settings: { ...store.settings, sites } });
  await injectIntoOpenTabs(site);
  await ensureAlarms();
  await updateBadge();
}

async function removeStoredSite(site) {
  const store = await getStore();
  const sites = (store.settings.sites || []).filter((item) => item !== site);
  await chrome.storage.local.set({ settings: { ...store.settings, sites } });
  await disableSiteInOpenTabs(site);
  await ensureAlarms();
  await updateBadge();
}

async function replaceStoredData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid replacement data");
  const days = data.days && typeof data.days === "object" && !Array.isArray(data.days) ? data.days : {};
  const articles = Array.isArray(data.articles) ? data.articles : [];
  const settings = data.settings && typeof data.settings === "object" && !Array.isArray(data.settings) ? data.settings : {};
  const freeze = data.freeze && typeof data.freeze === "object" && !Array.isArray(data.freeze) ? data.freeze : { count: 0, earned: 0 };
  const badges = data.badges && typeof data.badges === "object" && !Array.isArray(data.badges) ? data.badges : {};
  const readlater = Array.isArray(data.readlater) ? data.readlater : [];
  const meta = data.meta && typeof data.meta === "object" && !Array.isArray(data.meta) ? data.meta : {};
  await chrome.storage.local.set({
    days,
    articles,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    freeze,
    badges,
    readlater,
    meta,
  });
  await ensureAlarms();
  await updateBadge();
  await checkBadges();
}

async function setStoredRatingStatus(status) {
  if (!["done", "never", "later"].includes(status)) return;
  const { meta = {} } = await chrome.storage.local.get("meta");
  meta.rating = { status, at: Date.now() };
  await chrome.storage.local.set({ meta });
}

async function resetStoredData() {
  await chrome.storage.local.clear();
  await chrome.storage.local.set({
    settings: DEFAULT_SETTINGS,
    freeze: { count: 0, earned: 0 },
    badges: {},
  });
  await Promise.all([
    chrome.alarms.clear("eveningReminder"),
    chrome.alarms.clear("weeklyDigest"),
  ]);
  await updateBadge();
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const url = changeInfo.url || (changeInfo.status === "complete" && tab && tab.url);
  if (!url) return;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return;
    if (await isTrackedHost(u.hostname)) await injectReader(tabId);
  } catch (e) {
  }
});

// Messaging 

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "readingTick") {
    enqueueMutation(() => handleReadingTick(msg, sender))
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg && msg.type === "settingsUpdated") {
    enqueueMutation(async () => {
      if (msg.settings) await saveSettingsPatch(msg.settings);
      else {
        await ensureAlarms();
        await updateBadge();
      }
      if (msg.site) await injectIntoOpenTabs(msg.site);
    }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg && msg.type === "siteAdded") {
    enqueueMutation(() => addStoredSite(msg.site)).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg && msg.type === "siteRemoved") {
    enqueueMutation(() => removeStoredSite(msg.site)).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg && msg.type === "toggleStar") {
    enqueueMutation(() => toggleStoredStar(msg.url, msg.date)).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg && msg.type === "markReadLaterRead") {
    enqueueMutation(() => markStoredReadLaterRead(msg.url)).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg && msg.type === "removeReadLater") {
    enqueueMutation(() => removeStoredReadLater(msg.url)).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg && msg.type === "replaceData") {
    enqueueMutation(() => replaceStoredData(msg.data)).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg && msg.type === "setRatingStatus") {
    enqueueMutation(() => setStoredRatingStatus(msg.status)).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg && msg.type === "resetData") {
    enqueueMutation(resetStoredData).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get("settings");
  if (!settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  await ensureAlarms();
  await updateBadge();

  // Right-click read-later on any link.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "ms-read-later",
      title: "Save to MediumStreak read later",
      contexts: ["link"],
    });
  });
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarms();
  await updateBadge();
});

// Derive a readable title from a URL (used for read-later items, where the
// context menu only gives us the link).
function titleFromUrl(u) {
  try {
    const p = new URL(u);
    let seg = p.pathname.split("/").filter(Boolean).pop() || p.hostname;
    seg = decodeURIComponent(seg)
      .replace(/-[0-9a-f]{6,}$/i, "") // Medium's trailing content id
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!seg) return p.hostname;
    return seg.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 120);
  } catch (e) {
    return u;
  }
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== "ms-read-later" || !info.linkUrl) return;
  const url = info.linkUrl;
  if (!/^https?:/i.test(url)) return;
  enqueueMutation(async () => {
    const { readlater = [] } = await chrome.storage.local.get("readlater");
    if (readlater.some((item) => item.url === url && !item.completedAt)) {
      notify("Already saved 🔖", "That link is already in your read later list.");
      return;
    }
    readlater.push({ url, title: titleFromUrl(url), addedAt: Date.now() });
    await chrome.storage.local.set({ readlater });
    notify("Saved to read later 🔖", titleFromUrl(url));
  }).catch(() => {});
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (alarm.name === "dailyRollover") await enqueueMutation(handleRollover);
    if (alarm.name === "eveningReminder") await handleEveningReminder();
    if (alarm.name === "weeklyDigest") await handleWeeklyDigest();
  } catch (e) {
  }
});
