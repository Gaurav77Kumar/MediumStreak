const DEFAULT_SETTINGS = { dailyGoalMin: 10, minArticleMin: 3 };

async function load() {
  const { days = {}, settings = {}, freeze = { count: 0, earned: 0 } } = await chrome.storage.local.get([
    "days",
    "settings",
    "freeze",
  ]);
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const stats = computeStats(days, s);

  document.getElementById("streakNum").textContent = stats.currentStreak;
  document.getElementById("streakLabel").textContent =
    stats.currentStreak === 1 ? "day streak" : "day streak";

  const today = days[localDateKey()] || { minutes: 0 };
  const mins = Math.min(today.minutes || 0, s.dailyGoalMin);
  document.getElementById("todayText").textContent = `${(today.minutes || 0).toFixed(1)} / ${s.dailyGoalMin} min`;
  document.getElementById("todayBar").style.width = `${(mins / s.dailyGoalMin) * 100}%`;
  document.getElementById("todayHint").textContent = dayIsActive(today, s)
    ? "Today is lit up. Streak secured. ✅"
    : `${Math.max(0, Math.ceil(s.dailyGoalMin - (today.minutes || 0)))} more min of reading to keep the streak.`;

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

load();

document.getElementById("openDashboard").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

