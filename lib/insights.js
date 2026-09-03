// Deep-dive reading stats: weekday distribution, weekly/monthly series, and
// headline insight numbers. All pure functions over the storage shapes.

function countedArticles(articles, settings) {
  const minSeconds = settings.minArticleMin * 60;
  return articles.filter((a) => a.seconds >= minSeconds);
}

function totalWordsRead(articles, settings) {
  return countedArticles(articles, settings).reduce((n, a) => n + (a.words || 0), 0);
}

function weekdayMinutes(days) {
  const buckets = Array.from({ length: 7 }, () => 0);
  for (const key of Object.keys(days)) {
    const [y, m, d] = key.split("-").map(Number);
    buckets[new Date(y, m - 1, d).getDay()] += days[key].minutes || 0;
  }
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return buckets.map((minutes, i) => ({ label: labels[i], minutes: Math.round(minutes) }));
}

function weeklyMinutes(days, weeks = 12, today = new Date()) {
  const out = [];
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let w = weeks - 1; w >= 0; w--) {
    const blockEnd = addDays(end, -7 * w);
    const blockStart = addDays(blockEnd, -6);
    let minutes = 0;
    for (let i = 0; i < 7; i++) {
      const e = days[localDateKey(addDays(blockStart, i))];
      minutes += (e && e.minutes) || 0;
    }
    out.push({
      label: blockStart.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      minutes: Math.round(minutes),
    });
  }
  return out;
}

function monthlyMinutes(days, months = 12, today = new Date()) {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
    let minutes = 0;
    for (const key of Object.keys(days)) {
      const d = parseDateKey(key);
      if (d >= start && d < end) minutes += days[key].minutes || 0;
    }
    out.push({
      label: start.toLocaleDateString(undefined, { month: "short" }),
      minutes: Math.round(minutes),
    });
  }
  return out;
}

// Top topics across fully-read articles. Topics are scraped from the article's
// /tag/ links. Returns { tagged, total, topics: [{ topic, count }] } where
// `tagged` is how many counted articles carried any tags at all.
function topicDistribution(articles, settings) {
  const counted = countedArticles(articles, settings);
  const counts = {};
  let tagged = 0;
  for (const a of counted) {
    if (Array.isArray(a.topics) && a.topics.length) {
      tagged++;
      for (const t of a.topics) counts[t] = (counts[t] || 0) + 1;
    }
  }
  const topics = Object.entries(counts)
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  return { tagged, total: counted.length, topics };
}

// Headline numbers for the insights tab.
function summarizeReading(days, articles, settings) {
  const counted = countedArticles(articles, settings);
  const stats = computeStats(days, settings);

  const totalWords = counted.reduce((n, a) => n + (a.words || 0), 0);
  const totalSeconds = counted.reduce((n, a) => n + a.seconds, 0);
  const avgArticleMin = counted.length ? totalSeconds / 60 / counted.length : 0;
  const avgActiveDayMin = stats.totalActiveDays ? stats.totalMinutes / stats.totalActiveDays : 0;

  let bestDay = null;
  for (const key of Object.keys(days)) {
    const mins = days[key].minutes || 0;
    if (!bestDay || mins > bestDay.minutes) bestDay = { date: key, minutes: mins };
  }

  // Minutes over the trailing 7 days.
  let last7 = 0;
  const t = new Date();
  for (let i = 0; i < 7; i++) {
    const e = days[localDateKey(addDays(t, -i))];
    last7 += (e && e.minutes) || 0;
  }

  return {
    totalWords,
    countedArticles: counted.length,
    avgArticleMin: Math.round(avgArticleMin * 10) / 10,
    avgActiveDayMin: Math.round(avgActiveDayMin * 10) / 10,
    bestDay,
    last7Minutes: Math.round(last7),
    ...stats,
  };
}
