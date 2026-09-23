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
let renderedSites = [];

async function loadStore() {
  const {
    days = {},
    articles = [],
    settings = {},
    freeze = { count: 0, earned: 0 },
    badges = {},
    readlater = [],
    meta = {},
  } = await chrome.storage.local.get([
    "days",
    "articles",
    "settings",
    "freeze",
    "badges",
    "readlater",
    "meta",
  ]);
  return { days, articles, settings: sanitizeSettings(settings), freeze, badges, readlater, meta };
}

async function render() {
  const { days, articles, settings, freeze, badges, readlater } = await loadStore();
  const stats = computeStats(days, settings);
  const insights = summarizeReading(days, articles, settings);
  document.getElementById("currentStreak").textContent = stats.currentStreak;
  document.getElementById("freezeCount").textContent = freeze.count || 0;
  document.getElementById("statLongest").textContent = stats.longestStreak;
  document.getElementById("statActiveDays").textContent = stats.totalActiveDays;
  document.getElementById("statArticles").textContent = stats.totalArticles;
  document.getElementById("statMinutes").textContent = stats.totalMinutes;
  document.getElementById("goalEcho").textContent = settings.dailyGoalMin;

  renderHeatmap(document.getElementById("heatmap"), days, {
    weeks: 53,
    cell: 12,
    gap: 3,
    goalMin: settings.dailyGoalMin,
    showWeekdays: true,
  });

  renderHistory(articles, settings);

  // -- Insights --
  document.getElementById("insWords").textContent = formatBig(insights.totalWords);
  document.getElementById("insAvgArticle").textContent = insights.avgArticleMin;
  document.getElementById("insAvgDay").textContent = insights.avgActiveDayMin;
  document.getElementById("insLast7").textContent = insights.last7Minutes;
  if (insights.bestDay && insights.bestDay.minutes > 0) {
    const nice = new Date(insights.bestDay.date + "T12:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    document.getElementById("insBestDay").textContent = `${Math.round(insights.bestDay.minutes)} min`;
    document.getElementById("insBestDayLabel").textContent = `Best reading day — ${nice}`;
  } else {
    document.getElementById("insBestDay").textContent = "—";
    document.getElementById("insBestDayLabel").textContent = "Best reading day";
  }
  renderBarChart(document.getElementById("weekdayChart"), weekdayMinutes(days).map((d) => ({ label: d.label, value: d.minutes })), (v) => `${v} min`);
  renderBarChart(document.getElementById("weeklyChart"), weeklyMinutes(days, 12).map((d) => ({ label: d.label, value: d.minutes })), (v) => `${v} min`);
  renderBarChart(document.getElementById("monthlyChart"), monthlyMinutes(days, 12).map((d) => ({ label: d.label, value: d.minutes })), (v) => `${v} min`);
  renderTopicChart(articles, settings);

  // -- Badges --
  renderBadgeGrid(badges, insights);
  const earnedCount = Object.keys(badges).length;
  document.getElementById("badgeTabCount").textContent = earnedCount ? `${earnedCount}/${BADGES.length}` : "";

  // -- Badges --
  renderReadingList(articles, settings);
  renderReadLater(readlater);
  const savedCount = new Set([
    ...articles.filter((article) => article.starred).map((article) => article.url),
    ...readlater.map((item) => item.url),
  ]).size;
  document.getElementById("listTabCount").textContent = savedCount ? String(savedCount) : "";

  renderedSites = [...(settings.sites || [])];
  renderSites(renderedSites);
  fillSettingsForm(settings);
  maybeShowRatingPrompt(stats);
}

function formatBig(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

function articleReadTime(article) {
  return article.lastRead || Date.parse(`${article.date}T12:00:00`) || 0;
}

// -- Overview: history with stars --

function renderHistory(articles, settings) {
  const read = articles
    .filter((a) => typeof a.counted === "boolean"
      ? a.counted
      : a.seconds >= (a.minArticleMin || settings.minArticleMin) * 60)
    .sort((a, b) => (a.date === b.date ? articleReadTime(b) - articleReadTime(a) : a.date < b.date ? 1 : -1));

  document.getElementById("historyCount").textContent = `${read.length} article${read.length === 1 ? "" : "s"}`;
  document.getElementById("historyEmpty").hidden = read.length > 0;

  const list = document.getElementById("history");
  list.innerHTML = "";
  for (const a of read.slice(0, 100)) {
    const li = document.createElement("li");

    const left = document.createElement("div");
    left.className = "left";

    const star = document.createElement("button");
    star.className = "star-btn" + (a.starred ? " on" : "");
    star.textContent = a.starred ? "★" : "☆";
    star.title = a.starred ? "Remove from reading list" : "Save to reading list";
    star.addEventListener("click", () => toggleStar(a.url, a.date));

    const link = document.createElement("a");
    link.href = a.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = a.title || a.url;
    link.title = a.url;

    left.append(star, link);

    const meta = document.createElement("span");
    meta.className = "meta";
    const nice = new Date(a.date + "T12:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    meta.textContent = `${nice} · ${Math.round(a.seconds / 60)} min${a.words ? ` · ${formatBig(a.words)} words` : ""}`;

    li.append(left, meta);
    list.appendChild(li);
  }
}

async function toggleStar(url, date) {
  try {
    await chrome.runtime.sendMessage({ type: "toggleStar", url, date });
  } catch (e) {
  }
  await render();
}

// -- Reading list --
function renderReadingList(articles, settings) {
  const starred = articles
    .filter((a) => a.starred)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  document.getElementById("listEmpty").hidden = starred.length > 0;
  const list = document.getElementById("readingList");
  list.innerHTML = "";
  for (const a of starred) {
    const li = document.createElement("li");

    const left = document.createElement("div");
    left.className = "left";

    const star = document.createElement("button");
    star.className = "star-btn on";
    star.textContent = "★";
    star.title = "Remove from reading list";
    star.addEventListener("click", () => toggleStar(a.url, a.date));

    const link = document.createElement("a");
    link.href = a.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = a.title || a.url;
    link.title = a.url;

    left.append(star, link);

    const meta = document.createElement("span");
    meta.className = "meta";
    const nice = new Date(a.date + "T12:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    meta.textContent = `read ${nice} · ${Math.round(a.seconds / 60)} min`;
    li.append(left, meta);
    list.appendChild(li);
  }
}

// -- Topics chart --

function renderTopicChart(articles, settings) {
  const { topics, tagged, total } = topicDistribution(articles, settings);
  document.getElementById("topicEmpty").hidden = topics.length > 0;
  document.getElementById("topicMeta").textContent =
    tagged > 0 ? `${tagged} of ${total} articles tagged` : "";

  const chart = document.getElementById("topicChart");
  chart.innerHTML = "";
  const max = topics.length ? topics[0].count : 1;
  for (const t of topics) {
    const row = document.createElement("div");
    row.className = "topic-row";
    row.title = `${t.topic}: ${t.count} article${t.count === 1 ? "" : "s"}`;

    const name = document.createElement("span");
    name.className = "topic-name";
    name.textContent = t.topic;

    const bar = document.createElement("div");
    bar.className = "topic-bar";
    const fill = document.createElement("div");
    fill.style.width = `${Math.max(4, (t.count / max) * 100)}%`;
    bar.appendChild(fill);

    const count = document.createElement("span");
    count.className = "topic-count";
    count.textContent = t.count;

    row.append(name, bar, count);
    chart.appendChild(row);
  }
}

function renderReadLater(items) {
  const list = document.getElementById("readLater");
  list.innerHTML = "";
  document.getElementById("readLaterEmpty").hidden = items.length > 0;

  const sorted = [...items].sort((a, b) => {
    const aDone = a.completedAt ? 1 : 0;
    const bDone = b.completedAt ? 1 : 0;
    return aDone - bDone || (b.addedAt || 0) - (a.addedAt || 0);
  });
  for (const r of sorted) {
    const li = document.createElement("li");
    if (r.completedAt) li.classList.add("completed");

    const left = document.createElement("div");
    left.className = "left";

    const link = document.createElement("a");
    link.href = r.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = r.title || r.url;
    link.title = r.url;

    left.appendChild(link);

    const meta = document.createElement("span");
    meta.className = "meta";
    const nice = new Date(r.addedAt || Date.now()).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    meta.textContent = r.completedAt ? `read ${new Date(r.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : `saved ${nice}`;

    const actions = document.createElement("span");
    actions.className = "row-actions";

    const done = document.createElement("button");
    done.className = "row-btn ok";
    done.textContent = r.completedAt ? "Read ✓" : "✓ read";
    done.title = r.completedAt ? "Already marked as read" : "Mark as read";
    done.disabled = Boolean(r.completedAt);
    done.addEventListener("click", () => markReadLaterRead(r.url));

    const del = document.createElement("button");
    del.className = "row-btn";
    del.textContent = "✕";
    del.title = "Remove";
    del.addEventListener("click", () => removeFromReadLater(r.url));

    actions.append(done, del);
    li.append(left, meta, actions);
    list.appendChild(li);
  }
}

async function removeFromReadLater(url) {
  try {
    await chrome.runtime.sendMessage({ type: "removeReadLater", url });
  } catch (e) {
  }
  await render();
}

async function markReadLaterRead(url) {
  try {
    await chrome.runtime.sendMessage({ type: "markReadLaterRead", url });
  } catch (e) {
  }
  await render();
}


function renderBarChart(el, data, fmt) {
  // Chart data is display-only; round here so tooltips never show floats
  // even if a series math function changes.
  data = data.map((d) => ({ ...d, value: Math.round(d.value) }));
  const max = Math.max(...data.map((d) => d.value), 1);
  el.innerHTML = "";
  let pinned = null;

  for (const d of data) {
    const col = document.createElement("div");
    col.className = "chart-col" + (d.value <= 0 ? " zero" : "");
    col.title = `${d.label}: ${fmt(d.value)}`;
    col.tabIndex = 0;
    col.setAttribute("role", "img");
    col.setAttribute("aria-label", `${d.label}: ${fmt(d.value)}`);

    const pct = d.value <= 0 ? 0 : Math.max(4, (d.value / max) * 100);

    const bar = document.createElement("div");
    bar.className = "chart-bar";
    bar.style.height = pct + "%";

    // Value bubble — shows on hover, pins on click.
    const tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.textContent = `${d.label} · ${fmt(d.value)}`;
    tip.style.bottom = `calc(${pct}% + 26px)`;

    const label = document.createElement("div");
    label.className = "chart-label";
    label.textContent = d.label;

    col.append(tip, bar, label);

    col.addEventListener("mouseenter", () => tip.classList.add("show"));
    col.addEventListener("mouseleave", () => {
      if (pinned !== col) tip.classList.remove("show");
    });
    const toggleTip = () => {
      if (pinned && pinned !== col) {
        pinned.querySelector(".chart-tip").classList.remove("show");
        pinned = null;
      }
      pinned = pinned === col ? null : col;
      tip.classList.toggle("show", pinned === col);
    };
    col.addEventListener("click", toggleTip);
    col.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleTip();
      }
    });

    el.appendChild(col);
  }
}

// -- Badges --

function renderBadgeGrid(earned, stats) {
  const grid = document.getElementById("badgeGrid");
  grid.innerHTML = "";
  for (const b of BADGES) {
    const isEarned = !!earned[b.id];
    const card = document.createElement("div");
    card.className = "badge" + (isEarned ? "" : " locked");

    const icon = document.createElement("div");
    icon.className = "b-icon";
    icon.textContent = b.icon;

    const name = document.createElement("div");
    name.className = "b-name";
    name.textContent = b.name;

    const desc = document.createElement("div");
    desc.className = "b-desc";
    desc.textContent = b.desc;

    card.append(icon, name, desc);

    if (isEarned) {
      const date = document.createElement("div");
      date.className = "b-date";
      date.textContent = `Unlocked ${new Date(earned[b.id] + "T12:00:00").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`;
      card.appendChild(date);
    } else {
      const progress = badgeProgress(b, stats);
      const bar = document.createElement("div");
      bar.className = "b-progress";
      const fill = document.createElement("div");
      fill.style.width = `${Math.round(progress * 100)}%`;
      bar.appendChild(fill);
      card.appendChild(bar);
    }

    grid.appendChild(card);
  }
  const earnedCount = Object.keys(earned).length;
  document.getElementById("badgeProgressLabel").textContent = `${earnedCount} of ${BADGES.length} unlocked`;
}

// -- Settings --

function fillSettingsForm(settings) {
  document.getElementById("dailyGoalMin").value = settings.dailyGoalMin;
  document.getElementById("minArticleMin").value = settings.minArticleMin;
  document.getElementById("reminderEnabled").checked = !!settings.reminderEnabled;
  document.getElementById("reminderHour").value = String(settings.reminderHour);
  document.getElementById("digestEnabled").checked = !!settings.digestEnabled;
  document.getElementById("digestDay").value = String(settings.digestDay);
  document.getElementById("digestHour").value = String(settings.digestHour);
}

async function saveSettings() {
  // Merge over stored settings so fields managed elsewhere (sites) survive.
  const current = await loadStore();
  const settings = {
    ...current.settings,
    dailyGoalMin: clampInt(document.getElementById("dailyGoalMin").value, 1, 240, 10),
    minArticleMin: clampInt(document.getElementById("minArticleMin").value, 1, 60, 3),
    reminderEnabled: document.getElementById("reminderEnabled").checked,
    reminderHour: clampInt(document.getElementById("reminderHour").value, 0, 23, 20),
    digestEnabled: document.getElementById("digestEnabled").checked,
    digestDay: clampInt(document.getElementById("digestDay").value, 0, 6, 0),
    digestHour: clampInt(document.getElementById("digestHour").value, 0, 23, 18),
  };
  try {
    const response = await chrome.runtime.sendMessage({ type: "settingsUpdated", settings });
    if (!response || !response.ok) throw new Error("Settings could not be saved");
  } catch (error) {
    alert(`Settings could not be saved: ${error.message || error}`);
    return;
  }
  const toast = document.getElementById("saveToast");
  toast.hidden = false;
  setTimeout(() => (toast.hidden = true), 1600);
  render();
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function isValidDateKey(key) {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return localDateKey(parseDateKey(key)) === key;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (e) {
    return false;
  }
}

function finiteNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sanitizeSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const sites = Array.isArray(source.sites)
    ? [...new Set(source.sites.map(normalizeSite).filter(Boolean).filter((site) => !BUILTIN_SITES.includes(site)))]
    : [];
  return {
    dailyGoalMin: clampInt(source.dailyGoalMin, 1, 240, DEFAULT_SETTINGS.dailyGoalMin),
    minArticleMin: clampInt(source.minArticleMin, 1, 60, DEFAULT_SETTINGS.minArticleMin),
    reminderEnabled: typeof source.reminderEnabled === "boolean" ? source.reminderEnabled : DEFAULT_SETTINGS.reminderEnabled,
    reminderHour: clampInt(source.reminderHour, 0, 23, DEFAULT_SETTINGS.reminderHour),
    digestEnabled: typeof source.digestEnabled === "boolean" ? source.digestEnabled : DEFAULT_SETTINGS.digestEnabled,
    digestDay: clampInt(source.digestDay, 0, 6, DEFAULT_SETTINGS.digestDay),
    digestHour: clampInt(source.digestHour, 0, 23, DEFAULT_SETTINGS.digestHour),
    sites,
  };
}

function sanitizeDays(raw) {
  const days = {};
  const today = localDateKey();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return days;
  for (const [key, value] of Object.entries(raw)) {
    if (!isValidDateKey(key) || key > today || !value || typeof value !== "object") continue;
    days[key] = {
      minutes: Math.max(0, finiteNumber(value.minutes)),
      articles: Math.max(0, Math.round(finiteNumber(value.articles))),
      ...(finiteNumber(value.goalMin, 0) > 0 ? { goalMin: finiteNumber(value.goalMin) } : {}),
      ...(value.frozen === true ? { frozen: true } : {}),
    };
  }
  return days;
}

function sanitizeArticles(raw) {
  if (!Array.isArray(raw)) return [];
  const today = localDateKey();
  return raw.slice(0, 5000).flatMap((value) => {
    if (!value || typeof value !== "object" || !isHttpUrl(value.url) || !isValidDateKey(value.date) || value.date > today) return [];
    const topics = Array.isArray(value.topics)
      ? [...new Set(value.topics.filter((topic) => typeof topic === "string").map((topic) => topic.trim().slice(0, 80)).filter(Boolean))].slice(0, 5)
      : [];
    return [{
      url: new URL(value.url).href,
      title: typeof value.title === "string" ? value.title.slice(0, 200) : "",
      date: value.date,
      seconds: Math.max(0, finiteNumber(value.seconds)),
      words: Math.max(0, Math.round(finiteNumber(value.words))),
      lastRead: Math.max(0, finiteNumber(value.lastRead, Date.parse(`${value.date}T12:00:00`) || Date.now())),
      ...(finiteNumber(value.minArticleMin, 0) > 0 ? { minArticleMin: Math.max(1, Math.round(finiteNumber(value.minArticleMin))) } : {}),
      ...(typeof value.counted === "boolean" ? { counted: value.counted } : {}),
      starred: value.starred === true,
      topics,
    }];
  });
}

function sanitizeReadLater(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 2000).flatMap((value) => {
    if (!value || typeof value !== "object" || !isHttpUrl(value.url)) return [];
    return [{
      url: new URL(value.url).href,
      title: typeof value.title === "string" ? value.title.slice(0, 200) : "",
      addedAt: Math.max(0, finiteNumber(value.addedAt, Date.now())),
      ...(finiteNumber(value.completedAt, 0) > 0 ? { completedAt: finiteNumber(value.completedAt) } : {}),
    }];
  });
}

function sanitizeBadges(raw) {
  const badges = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return badges;
  const validIds = new Set(BADGES.map((badge) => badge.id));
  for (const [id, date] of Object.entries(raw)) {
    if (validIds.has(id) && isValidDateKey(date)) badges[id] = date;
  }
  return badges;
}

function sanitizeMeta(raw) {
  const meta = {};
  if (!raw || typeof raw !== "object") return meta;
  if (isValidDateKey(raw.lastCelebrated)) meta.lastCelebrated = raw.lastCelebrated;
  if (raw.rating && typeof raw.rating === "object" && ["done", "never", "later"].includes(raw.rating.status)) {
    meta.rating = { status: raw.rating.status, at: Math.max(0, finiteNumber(raw.rating.at, Date.now())) };
  }
  return meta;
}

function sanitizeBackup(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) || !data.days || typeof data.days !== "object" || Array.isArray(data.days)) {
    throw new Error("Not a valid MediumStreak backup");
  }
  const freeze = data.freeze && typeof data.freeze === "object" ? data.freeze : {};
  return {
    days: sanitizeDays(data.days),
    articles: sanitizeArticles(data.articles),
    settings: sanitizeSettings(data.settings),
    freeze: {
      count: Math.max(0, Math.round(finiteNumber(freeze.count))),
      earned: Math.max(0, Math.round(finiteNumber(freeze.earned))),
    },
    badges: sanitizeBadges(data.badges),
    readlater: sanitizeReadLater(data.readlater),
    meta: sanitizeMeta(data.meta),
  };
}

// -- Export / import --

async function exportData() {
  const store = await loadStore();
  const blob = new Blob(
    [JSON.stringify({ ...store, exportedAt: new Date().toISOString(), app: "MediumStreak" }, null, 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mediumstreak-backup-${localDateKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(file) {
  try {
    const text = await file.text();
    const data = sanitizeBackup(JSON.parse(text));
    if (chrome.permissions && typeof chrome.permissions.contains === "function") {
      const grantedSites = [];
      for (const site of data.settings.sites) {
        try {
          if (await chrome.permissions.contains({ origins: sitePermissionOrigins(site) })) grantedSites.push(site);
        } catch (e) {
        }
      }
      data.settings.sites = grantedSites;
    }
    if (!confirm("Importing replaces your current data. Continue?")) return;
    const response = await chrome.runtime.sendMessage({ type: "replaceData", data });
    if (!response || !response.ok) throw new Error("The backup could not be applied");
    await render();
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  }
}

async function resetAll() {
  if (!confirm("Delete ALL streak data? This cannot be undone.")) return;
  if (!confirm("Really sure? Your whole heatmap will be wiped.")) return;
  try {
    const response = await chrome.runtime.sendMessage({ type: "resetData" });
    if (!response || !response.ok) throw new Error("The reset could not be completed");
  } catch (error) {
    alert(`Reset failed: ${error.message || error}`);
    return;
  }
  await render();
}

// -- Multi-site management --

function isValidSiteHost(hostname) {
  const host = hostname.replace(/\.+$/, "");
  if (!host || host.length > 253 || /\s/.test(host)) return false;
  if (host.startsWith("[") || host.includes(":")) return /^\[[0-9a-f:.]+\]$/i.test(host);
  const labels = host.split(".");
  if (labels.some((label) => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) return false;
  if (/^\d+(?:\.\d+)+$/.test(host)) {
    return labels.every((label) => Number(label) <= 255);
  }
  return true;
}

function normalizeSite(raw) {
  let value = (typeof raw === "string" ? raw : "").trim().replace(/^([a-z][a-z\d+.-]*:\/\/)\*\./i, "$1").replace(/^\*\./, "").replace(/^\/\//, "");
  if (!value) return null;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.+$/, "");
    return isValidSiteHost(hostname) ? hostname : null;
  } catch (e) {
    return null;
  }
}

function isWildcardSite(site) {
  return site.includes(".") && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(site) && !site.startsWith("[");
}

function sitePermissionOrigins(site) {
  const origins = [`https://${site}/*`, `http://${site}/*`];
  if (isWildcardSite(site)) origins.push(`https://*.${site}/*`, `http://*.${site}/*`);
  return origins;
}

function renderSites(sites) {
  const list = document.getElementById("siteList");
  list.innerHTML = "";

  for (const s of BUILTIN_SITES) {
    const chip = document.createElement("span");
    chip.className = "site-chip builtin";
    chip.textContent = `🔒 ${s}`;
    chip.title = "Built-in — always tracked";
    list.appendChild(chip);
  }

  for (const s of sites) {
    const chip = document.createElement("span");
    chip.className = "site-chip";
    const label = document.createElement("span");
    label.textContent = s;
    const x = document.createElement("button");
    x.className = "chip-x";
    x.textContent = "✕";
    x.title = "Stop tracking this site (Chrome keeps the granted permission until removed in site settings)";
    x.addEventListener("click", () => removeSite(s));
    chip.append(label, x);
    list.appendChild(chip);
  }
}

async function requestSitePermission(site) {
  const origins = sitePermissionOrigins(site);
  if (!chrome.permissions || typeof chrome.permissions.request !== "function") {
    alert("Chrome permission access is unavailable. Reload the extension and try again.");
    return false;
  }
  try {
    const granted = await chrome.permissions.request({ origins });
    if (!granted) {
      alert(`Chrome did not grant access to ${site}. Click Add site again and choose Allow.`);
      return false;
    }
    if (typeof chrome.permissions.contains === "function") {
      const hasAccess = await chrome.permissions.contains({ origins });
      if (!hasAccess) {
        alert(`Chrome did not retain access to ${site}. Check the extension's site permissions and try again.`);
        return false;
      }
    }
    return true;
  } catch (error) {
    alert(`Could not request access to ${site}: ${error.message || error}`);
    return false;
  }
}

async function addSite() {
  const input = document.getElementById("siteInput");
  const site = normalizeSite(input.value);
  if (!site) {
    alert("Enter an HTTP or HTTPS site, such as example.com, localhost, or 127.0.0.1.");
    return;
  }
  if (BUILTIN_SITES.some((b) => site === b || site.endsWith("." + b))) {
    alert("That site is already tracked.");
    return;
  }
  if (!await requestSitePermission(site)) return;

  const current = await loadStore();
  if ((current.settings.sites || []).includes(site)) {
    if (!renderedSites.includes(site)) alert("That site is already tracked.");
    input.value = "";
    await render();
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: "siteAdded", site });
    if (!response || !response.ok) throw new Error("The site could not be saved");
  } catch (error) {
    alert(`Could not add ${site}: ${error.message || error}`);
    return;
  }
  input.value = "";
  await render();
}

async function removeSite(site) {
  try {
    const response = await chrome.runtime.sendMessage({ type: "siteRemoved", site });
    if (!response || !response.ok) throw new Error("The site could not be removed");
    if (chrome.permissions && typeof chrome.permissions.remove === "function") {
      await chrome.permissions.remove({ origins: sitePermissionOrigins(site) });
    }
  } catch (error) {
    alert(`Could not remove ${site}: ${error.message || error}`);
    return;
  }
  await render();
}

// -- One-time rating prompt --
// Shows after the user has a real history (5+ active days), at most once,
// with a "maybe later" cooldown instead of nagging.

const RATING_LATER_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

async function maybeShowRatingPrompt(stats) {
  const banner = document.getElementById("ratingBanner");
  if (stats.totalActiveDays < 5) return;

  const { meta = {} } = await chrome.storage.local.get("meta");
  const r = meta.rating || {};
  if (r.status === "done" || r.status === "never") return;
  if (r.status === "later" && Date.now() - (r.at || 0) < RATING_LATER_COOLDOWN_MS) return;

  banner.hidden = false;
}

async function setRatingStatus(status) {
  try {
    await chrome.runtime.sendMessage({ type: "setRatingStatus", status });
  } catch (e) {
  }
  document.getElementById("ratingBanner").hidden = true;
}

// -- Wrapped modal --

function openWrappedModal() {
  loadStore().then(({ days, articles, settings }) => {
    drawWrapped(document.getElementById("wrappedCanvas"), { days, articles, settings });
    document.getElementById("wrappedModal").hidden = false;
  });
}

function openShareModal() {
  loadStore().then(({ days, settings, freeze }) => {
    const stats = computeStats(days, settings);
    drawShareCard(document.getElementById("shareCanvas"), { days, settings, stats });
    document.getElementById("shareModal").hidden = false;
  });
}

// -- Tabs --

function setupTabs() {
  const container = document.getElementById("tabs");
  const tabs = [...container.querySelectorAll(".tab")];
  const activate = (button, focus = false) => {
    for (const tab of tabs) {
      const active = tab === button;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      const page = document.getElementById("tab-" + tab.dataset.tab);
      if (page) page.classList.toggle("active", active);
    }
    if (focus) button.focus();
  };
  tabs.forEach((tab, index) => {
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", "tab-" + tab.dataset.tab);
    tab.tabIndex = index === 0 ? 0 : -1;
  });
  container.addEventListener("click", (event) => {
    const button = event.target.closest(".tab");
    if (button) activate(button);
  });
  container.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = tabs.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    activate(tabs[next], true);
  });
}

let storageRenderTimer = null;
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || storageRenderTimer !== null) return;
    storageRenderTimer = setTimeout(() => {
      storageRenderTimer = null;
      render().catch(() => {});
    }, 250);
  });
}

render();
setupTabs();

document.getElementById("saveSettings").addEventListener("click", saveSettings);
document.getElementById("exportBtn").addEventListener("click", exportData);
document.getElementById("importFile").addEventListener("change", (e) => {
  if (e.target.files[0]) importData(e.target.files[0]);
  e.target.value = "";
});
document.getElementById("resetBtn").addEventListener("click", resetAll);
document.getElementById("shareBtn").addEventListener("click", openShareModal);
document.getElementById("wrappedBtn").addEventListener("click", openWrappedModal);
document.getElementById("wrappedClose").addEventListener("click", () => {
  document.getElementById("wrappedModal").hidden = true;
});
document.getElementById("wrappedModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.hidden = true;
});
document.getElementById("wrappedDownload").addEventListener("click", () => {
  downloadWrapped(document.getElementById("wrappedCanvas"));
});
document.getElementById("addSite").addEventListener("click", addSite);
document.getElementById("siteInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addSite();
});
document.getElementById("rateLink").href = typeof MS_STORE_URL !== "undefined" ? MS_STORE_URL : "#";
document.getElementById("rateLink").addEventListener("click", () => setRatingStatus("done"));
document.getElementById("rateLater").addEventListener("click", () => setRatingStatus("later"));
document.getElementById("rateNever").addEventListener("click", () => setRatingStatus("never"));
document.getElementById("shareClose").addEventListener("click", () => {
  document.getElementById("shareModal").hidden = true;
});
document.getElementById("shareModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.hidden = true;
});
document.getElementById("shareDownload").addEventListener("click", () => {
  downloadShareCard(document.getElementById("shareCanvas"));
});
