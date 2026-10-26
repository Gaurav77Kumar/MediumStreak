/* Weekly reading challenges — shared definitions + progress math.
// Used by background.js (via importScripts), dashboard and popup
// (via <script> tags). Depends on lib/streak.js helpers.
*/

const CHALLENGE_DEFS = [
  { id: "days5", icon: "📅", name: "Five Days", desc: "Read on 5 different days this week", target: 5, metric: "days" },
  { id: "min60", icon: "⏱️", name: "Hour of Power", desc: "Read 60 minutes this week", target: 60, metric: "minutes" },
  { id: "art5", icon: "📚", name: "Five Finishes", desc: "Finish 5 articles this week", target: 5, metric: "articles" },
  { id: "w10k", icon: "🔤", name: "10k Words", desc: "Read 10,000 words this week", target: 10000, metric: "words" },
];

// Weeks run Monday → Sunday. ISO date keys compare correctly as strings.
function weekStartDateKey(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return localDateKey(addDays(d, -((d.getDay() + 6) % 7)));
}

function weekRangeLabel(weekStartKey) {
  const start = parseDateKey(weekStartKey);
  const end = addDays(start, 6);
  const fmt = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString(undefined, fmt)} – ${end.toLocaleDateString(undefined, fmt)}`;
}

// Same counting rule as the background worker and dashboard history:
// a finished article is one that crossed its (frozen) minimum-minutes bar.
function challengeArticleCounted(article, settings) {
  return typeof article.counted === "boolean"
    ? article.counted
    : article.seconds >= (article.minArticleMin || settings.minArticleMin) * 60;
}

// Progress of one challenge over the week starting at weekStartKey.
// Frozen days count as reading days (the streak covered them).
function weekProgress(days, articles, settings, weekStartKey, def) {
  let current = 0;
  if (def.metric === "days" || def.metric === "minutes") {
    for (const key of Object.keys(days)) {
      if (key < weekStartKey) continue;
      const entry = days[key];
      if (!entry) continue;
      if (def.metric === "days") {
        if (dayIsActive(entry, settings)) current++;
      } else {
        current += entry.minutes || 0;
      }
    }
  } else {
    for (const article of articles) {
      if (!article || typeof article.date !== "string" || article.date < weekStartKey) continue;
      if (!challengeArticleCounted(article, settings)) continue;
      if (def.metric === "articles") current++;
      else current += article.words || 0;
    }
  }
  return {
    current: Math.round(current),
    target: def.target,
    done: current >= def.target,
  };
}

// Validate + carry the stored challenge state forward to the current week.
// Enrollments persist across weeks; per-week completions reset on flip.
function normalizeChallengeState(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const validIds = CHALLENGE_DEFS.map((d) => d.id);
  const iso = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const state = {
    weekStart: iso(src.weekStart) ? src.weekStart : weekStartDateKey(),
    enrolled: Array.isArray(src.enrolled) ? [...new Set(src.enrolled.filter((id) => validIds.includes(id)))] : [],
    completed: Array.isArray(src.completed) ? [...new Set(src.completed.filter((id) => validIds.includes(id)))] : [],
    log: Array.isArray(src.log)
      ? src.log
          .filter((e) => e && typeof e === "object" && validIds.includes(e.id) && iso(e.week))
          .slice(-200)
      : [],
  };
  const thisWeek = weekStartDateKey();
  if (state.weekStart !== thisWeek) {
    state.weekStart = thisWeek;
    state.completed = [];
  }
  return state;
}
