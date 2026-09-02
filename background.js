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
const BUILTIN_SITES = ["medium.com"];
const MAX_ARTICLES = 1000;

async function getStore() {
  const { days = {}, articles = [], settings = {}, freeze = { count: 0, earned: 0 }, badges = {} } =
    await chrome.storage.local.get(["days", "articles", "settings", "freeze", "badges"]);
  return {
    days,
    articles,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    freeze,
    badges,
  };
}

function totalWordsRead(articles, settings) {
  const minSeconds = settings.minArticleMin * 60;
  return articles.reduce((n, a) => (a.seconds >= minSeconds ? n + (a.words || 0) : n), 0);
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

  const day = store.days[today] || { minutes: 0, articles: 0 };
  const prevMinutes = day.minutes;
  day.minutes = Math.round((day.minutes + seconds / 60) * 100) / 100;

  let entry = store.articles.find((a) => a.url === url && a.date === today);
  let counted = false;
  if (entry) counted = entry.seconds >= store.settings.minArticleMin * 60;
  else {
    entry = { url, title, date: today, seconds: 0 };
    store.articles.push(entry);
  }
  entry.seconds += seconds;
  if (title) entry.title = title;
  if (words) entry.words = Math.max(entry.words || 0, words);
  if (Array.isArray(topics) && topics.length) entry.topics = topics.slice(0, 5);

  if (!counted && entry.seconds >= store.settings.minArticleMin * 60) day.articles++;

  store.days[today] = day;
  if (store.articles.length > MAX_ARTICLES) {
    // Starred articles are never pruned; the rest keep the newest half.
    const starred = store.articles.filter((a) => a.starred);
    const others = store.articles
      .filter((a) => !a.starred)
      .sort((a, b) => ((a.lastRead || 0) < (b.lastRead || 0) ? -1 : 1))
      .slice(-MAX_ARTICLES / 2);
    store.articles = starred.concat(others);
  }

  await chrome.storage.local.set({ days: store.days, articles: store.articles });
  updateBadge();
  checkBadges();

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
    periodInMinutes: 24 * 60,
  });
  if (store.settings.reminderEnabled) {
    await chrome.alarms.create("eveningReminder", {
      when: nextAt(store.settings.reminderHour),
      periodInMinutes: 24 * 60,
    });
  }
  if (store.settings.digestEnabled) {
    await chrome.alarms.create("weeklyDigest", {
      when: nextDayAt(store.settings.digestDay, store.settings.digestHour),
      periodInMinutes: 7 * 24 * 60,
    });
  }
}

// Runs just after midnight: decide whether yesterday broke the streak.
async function handleRollover() {
  const store = await getStore();
  const yesterdayKey = localDateKey(addDays(new Date(), -1));
  const day = store.days[yesterdayKey];

  if (!dayIsActive(day, store.settings)) {
    if (store.freeze.count > 0) {
      store.freeze.count--;
      const frozen = day || { minutes: 0, articles: 0 };
      frozen.frozen = true;
      store.days[yesterdayKey] = frozen;
      notify("Streak freeze used ❄️", "You missed yesterday, but a freeze saved your streak.");
    }
  } else if (!day.frozen) {
    // Every full 7-day streak earns one freeze, awarded the night it completes.
    let streak = 0;
    let cursor = addDays(new Date(), -1);
    while (dayIsActive(store.days[localDateKey(cursor)], store.settings)) {
      streak++;
      cursor = addDays(cursor, -1);
    }
    if (streak > 0 && streak % 7 === 0) {
      store.freeze.earned++;
      store.freeze.count++;
      notify("Streak freeze earned ❄️", `${streak}-day streak! You banked one streak freeze.`);
    }
  }

  await chrome.storage.local.set({ days: store.days, freeze: store.freeze });
  updateBadge();
  checkBadges();
}

async function handleEveningReminder() {
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

// -- Multi-site: inject the reader into user-added sites --
// Medium is matched statically in the manifest; extra sites get the reader
// injected programmatically once the user grants the host permission.

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
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || (changeInfo.status === "complete" && tab && tab.url);
  if (!url) return;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return;
    isTrackedHost(u.hostname).then((tracked) => {
      if (tracked) injectReader(tabId);
    });
  } catch (e) { /* not a URL we care about */ }
});

// Messaging 

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "readingTick") handleReadingTick(msg, sender);
  if (msg && msg.type === "settingsUpdated") {
    ensureAlarms();
    updateBadge();
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

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "ms-read-later" || !info.linkUrl) return;
  const url = info.linkUrl;
  if (!/^https?:/i.test(url)) return;

  const { readlater = [] } = await chrome.storage.local.get("readlater");
  if (readlater.some((r) => r.url === url)) {
    notify("Already saved 🔖", "That link is already in your read later list.");
    return;
  }
  readlater.push({ url, title: titleFromUrl(url), addedAt: Date.now() });
  await chrome.storage.local.set({ readlater });
  notify("Saved to read later 🔖", titleFromUrl(url));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "dailyRollover") handleRollover();
  if (alarm.name === "eveningReminder") handleEveningReminder();
  if (alarm.name === "weeklyDigest") handleWeeklyDigest();
});
