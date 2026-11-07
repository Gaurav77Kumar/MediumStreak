/* Monthly topic goals — shared state + progress math.
 Depends on lib/insights.js (countedArticles, topicDistribution). Used by
 background.js (via importScripts) and the dashboard (via <script> tag).

 Goals persist across months; progress and completions reset when the
 month flips (progress is recomputed from article dates, so nothing is
 stored for it). Completions collect in a per-month log.
*/

const GOALS_MAX = 10;
const GOALS_TARGET_MAX = 50;
const GOALS_LOG_CAP = 200;

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const isMonthKey = (v) => typeof v === "string" && /^\d{4}-\d{2}$/.test(v);

function normalizeTopicGoalsState(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const month = monthKey();

  const goals = (Array.isArray(src.goals) ? src.goals : [])
    .map((g) => {
      if (!g || typeof g !== "object" || typeof g.topic !== "string" || !g.topic.trim()) return null;
      const topic = g.topic.trim().slice(0, 60);
      const target = Math.min(GOALS_TARGET_MAX, Math.max(1, Math.round(Number(g.target)) || 1));
      const id = typeof g.id === "string" && g.id ? g.id.slice(0, 40) : `tg-${topic.toLowerCase().replace(/\W+/g, "-")}-${target}`;
      return { id, topic, target };
    })
    .filter(Boolean)
    .filter((g, i, all) => all.findIndex((x) => x.topic.toLowerCase() === g.topic.toLowerCase()) === i)
    .slice(0, GOALS_MAX);

  const validIds = new Set(goals.map((g) => g.id));
  const state = {
    month: isMonthKey(src.month) ? src.month : month,
    goals,
    completed: (Array.isArray(src.completed) ? src.completed : []).filter((id) => validIds.has(id)),
    log: (Array.isArray(src.log) ? src.log : [])
      .filter((e) => e && typeof e === "object" && typeof e.topic === "string" && isMonthKey(e.month))
      .slice(-GOALS_LOG_CAP),
  };

  if (state.month !== month) {
    state.month = month;
    state.completed = [];
  }
  return state;
}

// Finished articles this month whose tags include the goal's topic
// (case-insensitive). Reuses the same "finished article" rule as history.
function topicGoalProgress(articles, settings, goal, month) {
  const needle = goal.topic.toLowerCase();
  let current = 0;
  for (const article of countedArticles(articles, settings)) {
    if (typeof article.date !== "string" || !article.date.startsWith(month)) continue;
    if (Array.isArray(article.topics) && article.topics.some((t) => String(t).toLowerCase() === needle)) current++;
  }
  return { current, target: goal.target, done: current >= goal.target };
}

// Suggestion chips: the user's own most-read topics.
function suggestTopics(articles, settings, limit = 8) {
  return topicDistribution(articles, settings).topics.map((t) => t.topic).slice(0, limit);
}
