const DEFAULT_SETTINGS = { dailyGoalMin: 10, minArticleMin: 3 };

async function load() {
  const {
    days = {},
    settings = {},
    freeze = { count: 0, earned: 0 },
    challenges = {},
    articles = [],
  } = await chrome.storage.local.get([
    "days",
    "settings",
    "freeze",
    "challenges",
    "articles",
  ]);
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const stats = computeStats(days, s);

  renderChallengeStrip(days, articles, s, challenges);

  document.getElementById("streakNum").textContent = stats.currentStreak;
  document.getElementById("streakLabel").textContent =
    stats.currentStreak === 1 ? "day streak" : "day streak";

  const today = days[localDateKey()] || { minutes: 0 };
  const mins = Math.min(today.minutes || 0, s.dailyGoalMin);
  document.getElementById("todayText").textContent = `${(today.minutes || 0).toFixed(1)} / ${s.dailyGoalMin} min`;
  document.getElementById("todayBar").style.width = `${(mins / s.dailyGoalMin) * 100}%`;
  const left = Math.max(0, Math.ceil(s.dailyGoalMin - (today.minutes || 0)));
  document.getElementById("todayHint").textContent = dayIsActive(today, s)
    ? "Today is lit up. Streak secured. ✅"
    : stats.currentStreak > 0
      ? `${left} more min of reading to keep the streak.`
      : `${left} min of reading starts a new streak.`;

  document.getElementById("longestStreak").textContent = stats.longestStreak;
  document.getElementById("totalArticles").textContent = stats.totalArticles;
  document.getElementById("totalMinutes").textContent = stats.totalMinutes;
  document.getElementById("freezeCount").textContent = freeze.count || 0;

  renderHeatmap(document.getElementById("heatmap"), days, {
    weeks: 10,
    cell: 13,
    gap: 3,
    goalMin: s.dailyGoalMin,
  });
}

load().catch(() => {});
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") load().catch(() => {});
  });
}

document.getElementById("openDashboard").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// -- Challenge strip --

function renderChallengeStrip(days, articles, s, rawChallenges) {
  const state = normalizeChallengeState(rawChallenges);
  const enrolled = CHALLENGE_DEFS.filter((def) => state.enrolled.includes(def.id));
  const strip = document.getElementById("challengeStrip");
  if (!enrolled.length) {
    strip.hidden = true;
    return;
  }

  const incomplete = enrolled.filter((def) => !state.completed.includes(def.id));
  let text;
  if (!incomplete.length) {
    text = `🏆 All ${enrolled.length} weekly challenge${enrolled.length === 1 ? "" : "s"} complete!`;
  } else {
    const def = incomplete[0];
    const p = weekProgress(days, articles, s, state.weekStart, def);
    text = `${def.icon} ${def.name} — ${p.current.toLocaleString()} / ${p.target.toLocaleString()}${
      incomplete.length > 1 ? ` · ${incomplete.length - 1} more challenge${incomplete.length - 1 === 1 ? "" : "s"}` : ""
    }`;
  }
  document.getElementById("challengeText").textContent = text;
  strip.hidden = false;
}

