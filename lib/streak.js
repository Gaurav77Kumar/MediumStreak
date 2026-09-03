/* Shared date + streak math. Used by background.js (via importScripts),
// popup and dashboard (via <script> tags).
*/

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// A day "counts" for the streak when the goal is met, or a streak freeze
// covered the miss (frozen days are treated as active).
function dayIsActive(entry, settings) {
  return !!entry && (entry.frozen || (entry.minutes || 0) >= (settings.dailyGoalMin || 10));
}

function computeStats(days, settings, today = new Date()) {
  // Current streak: consecutive active days ending today (if today is active),
  // otherwise ending yesterday — a live streak isn't broken just because you
  // haven't read yet today.
  let current = 0;
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!dayIsActive(days[localDateKey(cursor)], settings)) {
    cursor = addDays(cursor, -1);
  }
  while (dayIsActive(days[localDateKey(cursor)], settings)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  // Longest streak over all recorded days (sparse-safe, DST-safe via keys).
  const keys = Object.keys(days)
    .filter((k) => dayIsActive(days[k], settings))
    .sort();
  let longest = 0;
  let run = 0;
  let prevKey = null;
  for (const k of keys) {
    const expected = prevKey ? localDateKey(addDays(parseDateKey(prevKey), 1)) : null;
    run = k === expected ? run + 1 : 1;
    if (run > longest) longest = run;
    prevKey = k;
  }

  let totalMinutes = 0;
  let totalArticles = 0;
  let totalActiveDays = 0;
  for (const k of Object.keys(days)) {
    const e = days[k];
    totalMinutes += e.minutes || 0;
    totalArticles += e.articles || 0;
    if (dayIsActive(e, settings)) totalActiveDays++;
  }

  return {
    currentStreak: current,
    longestStreak: longest,
    totalMinutes: Math.round(totalMinutes),
    totalArticles,
    totalActiveDays,
  };
}
