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

async function loadStore() {
  const {
    days = {},
    articles = [],
    settings = {},
    freeze = { count: 0, earned: 0 },
    badges = {},
    readlater = [],
  } = await chrome.storage.local.get([
    "days",
    "articles",
    "settings",
    "freeze",
    "badges",
    "readlater",
  ]);
  return { days, articles, settings: { ...DEFAULT_SETTINGS, ...settings }, freeze, badges, readlater };
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
  const savedCount = articles.filter((a) => a.starred).length + readlater.length;
  document.getElementById("listTabCount").textContent = savedCount ? String(savedCount) : "";

  renderSites(settings.sites || []);
  fillSettingsForm(settings);
  maybeShowRatingPrompt(stats);
}

function formatBig(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

// -- Overview: history with stars --

function renderHistory(articles, settings) {
  const minSeconds = settings.minArticleMin * 60;
  const read = articles
    .filter((a) => a.seconds >= minSeconds)
    .sort((a, b) => (a.date === b.date ? (b.lastRead || 0) - (a.lastRead || 0) : a.date < b.date ? 1 : -1));

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
  const { articles = [] } = await chrome.storage.local.get("articles");
  const entry = articles.find((a) => a.url === url && a.date === date);
  if (entry) entry.starred = !entry.starred;
  await chrome.storage.local.set({ articles });
  render();
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

  const sorted = [...items].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  for (const r of sorted) {
    const li = document.createElement("li");

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
    meta.textContent = `saved ${nice}`;

    const actions = document.createElement("span");
    actions.className = "row-actions";

    const done = document.createElement("button");
    done.className = "row-btn ok";
    done.textContent = "✓ read";
    done.title = "Mark as read (removes from queue)";
    done.addEventListener("click", () => removeFromReadLater(r.url));

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
  const { readlater = [] } = await chrome.storage.local.get("readlater");
  await chrome.storage.local.set({ readlater: readlater.filter((r) => r.url !== url) });
  render();
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
    col.addEventListener("click", () => {
      if (pinned && pinned !== col) {
        pinned.querySelector(".chart-tip").classList.remove("show");
        pinned = null;
      }
      pinned = pinned === col ? null : col;
      tip.classList.toggle("show", pinned === col);
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
  await chrome.storage.local.set({ settings });
  try {
    chrome.runtime.sendMessage({ type: "settingsUpdated" });
  } catch (e) {
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
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || !data.days) throw new Error("Not a MediumStreak backup");
    if (!confirm("Importing replaces your current data. Continue?")) return;
    await chrome.storage.local.set({
      days: data.days || {},
      articles: Array.isArray(data.articles) ? data.articles : [],
      settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
      freeze: data.freeze || { count: 0, earned: 0 },
      badges: data.badges || {},
      readlater: Array.isArray(data.readlater) ? data.readlater : [],
    });
    render();
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  }
}

async function resetAll() {
  if (!confirm("Delete ALL streak data? This cannot be undone.")) return;
  if (!confirm("Really sure? Your whole heatmap will be wiped.")) return;
  await chrome.storage.local.clear();
  await chrome.storage.local.set({
    settings: DEFAULT_SETTINGS,
    freeze: { count: 0, earned: 0 },
    badges: {},
  });
  render();
}

// -- Multi-site management --

function normalizeSite(raw) {
  let s = (raw || "").trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  s = s.replace(/\.+$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;
  return s;
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

async function addSite() {
  const input = document.getElementById("siteInput");
  const site = normalizeSite(input.value);
  if (!site) {
    alert("Enter a plain domain like substack.com or dev.to");
    return;
  }
  if (BUILTIN_SITES.some((b) => site === b || site.endsWith("." + b))) {
    alert("That site is already tracked.");
    return;
  }
  // Chrome only honors permission requests made with a fresh user gesture, so
  // request BEFORE any slow awaits (storage reads) can let the gesture age out.
  if (chrome.permissions && chrome.permissions.request) {
    const granted = await chrome.permissions.request({
      origins: [`*://${site}/*`, `*://*.${site}/*`],
    });
    if (!granted) return;
  }

  const current = await loadStore();
  if ((current.settings.sites || []).includes(site)) {
    alert("That site is already tracked.");
    return;
  }

  const sites = [...(current.settings.sites || []), site];
  await chrome.storage.local.set({ settings: { ...current.settings, sites } });
  try {
    chrome.runtime.sendMessage({ type: "settingsUpdated" });
  } catch (e) { /* dev/mock */ }
  input.value = "";
  render();
}

async function removeSite(site) {
  const current = await loadStore();
  const sites = (current.settings.sites || []).filter((s) => s !== site);
  await chrome.storage.local.set({ settings: { ...current.settings, sites } });
  render();
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
  const { meta = {} } = await chrome.storage.local.get("meta");
  meta.rating = { status, at: Date.now() };
  await chrome.storage.local.set({ meta });
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
  document.getElementById("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    for (const t of document.querySelectorAll(".tab")) t.classList.toggle("active", t === btn);
    for (const page of document.querySelectorAll(".tab-page")) {
      page.classList.toggle("active", page.id === "tab-" + btn.dataset.tab);
    }
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
