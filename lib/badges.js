/*Badge definitions + unlock evaluation. A badge is earned purely from stats,
 so it's always safe to re-evaluate. `earned` maps badgeId -> dateKey.

Each badge tracks one stats field against a numeric target; the test and
 progress bar are derived from those two values.

Stats fields available: currentStreak, longestStreak, totalArticles,
/\ totalMinutes, totalActiveDays, totalWords.
*/

const BADGES = [
  // -- Articles read --
  { id: "first-article", icon: "📖", name: "First Steps", desc: "Read your first article", field: "totalArticles", target: 1 },
  { id: "articles-5", icon: "🌊", name: "Getting Going", desc: "Read 5 articles", field: "totalArticles", target: 5 },
  { id: "articles-10", icon: "📚", name: "Bookworm", desc: "Read 10 articles", field: "totalArticles", target: 10 },
  { id: "articles-25", icon: "🎓", name: "Avid Reader", desc: "Read 25 articles", field: "totalArticles", target: 25 },
  { id: "articles-50", icon: "🦉", name: "Scholar", desc: "Read 50 articles", field: "totalArticles", target: 50 },
  { id: "articles-100", icon: "🏛️", name: "Century Club", desc: "Read 100 articles", field: "totalArticles", target: 100 },
  { id: "articles-250", icon: "🚀", name: "Page Devourer", desc: "Read 250 articles", field: "totalArticles", target: 250 },

  // -- Words read --
  { id: "words-10k", icon: "✍️", name: "Ten Thousand Words", desc: "Read 10,000 words", field: "totalWords", target: 10000 },
  { id: "words-100k", icon: "📝", name: "100K Words", desc: "Read 100,000 words", field: "totalWords", target: 100000 },
  { id: "words-500k", icon: "🏆", name: "Half Million Words", desc: "Read 500,000 words", field: "totalWords", target: 500000 },
  { id: "words-1m", icon: "💎", name: "Word Millionaire", desc: "Read 1,000,000 words", field: "totalWords", target: 1000000 },

  // -- Total reading time --
  { id: "minutes-30", icon: "⏳", name: "First Half Hour", desc: "Read for 30 minutes total", field: "totalMinutes", target: 30 },
  { id: "minutes-60", icon: "⏱️", name: "Hour One", desc: "Read for 1 hour total", field: "totalMinutes", target: 60 },
  { id: "minutes-600", icon: "🕰️", name: "Ten Hours Deep", desc: "Read for 10 hours total", field: "totalMinutes", target: 600 },
  { id: "minutes-1800", icon: "🌙", name: "Thirty Hours", desc: "Read for 30 hours total", field: "totalMinutes", target: 1800 },
  { id: "minutes-3000", icon: "🧠", name: "Fifty Hours", desc: "Read for 50 hours total", field: "totalMinutes", target: 3000 },
  { id: "minutes-6000", icon: "🏅", name: "Hundred Hours", desc: "Read for 100 hours total", field: "totalMinutes", target: 6000 },

  // -- Active days --
  { id: "days-10", icon: "🌤️", name: "The Regular", desc: "10 active days", field: "totalActiveDays", target: 10 },
  { id: "days-30", icon: "🗓️", name: "Monthly Regular", desc: "30 active days", field: "totalActiveDays", target: 30 },
  { id: "days-100", icon: "🧗", name: "Consistency Climber", desc: "100 active days", field: "totalActiveDays", target: 100 },
  { id: "days-200", icon: "🛡️", name: "Relentless", desc: "200 active days", field: "totalActiveDays", target: 200 },
  { id: "days-365", icon: "🌍", name: "Year-Round Reader", desc: "365 active days", field: "totalActiveDays", target: 365 },

  // -- Streaks --
  { id: "streak-3", icon: "🌱", name: "Sprout", desc: "3-day streak", field: "longestStreak", target: 3 },
  { id: "streak-7", icon: "🔥", name: "Week Warrior", desc: "7-day streak", field: "longestStreak", target: 7 },
  { id: "streak-14", icon: "⚡", name: "Momentum", desc: "14-day streak", field: "longestStreak", target: 14 },
  { id: "streak-21", icon: "🧲", name: "Habit Formed", desc: "21-day streak", field: "longestStreak", target: 21 },
  { id: "streak-30", icon: "🏔️", name: "Monthly Master", desc: "30-day streak", field: "longestStreak", target: 30 },
  { id: "streak-50", icon: "💪", name: "Half Century", desc: "50-day streak", field: "longestStreak", target: 50 },
  { id: "streak-100", icon: "💯", name: "Centurion", desc: "100-day streak", field: "longestStreak", target: 100 },
  { id: "streak-150", icon: "🔱", name: "Unstoppable", desc: "150-day streak", field: "longestStreak", target: 150 },
  { id: "streak-365", icon: "👑", name: "Legend", desc: "365-day streak", field: "longestStreak", target: 365 },
];

for (const b of BADGES) {
  b.test = (stats) => (stats[b.field] || 0) >= b.target;
}

function newlyEarnedBadges(earned, stats) {
  return BADGES.filter((b) => !earned[b.id] && b.test(stats));
}

function badgeProgress(badge, stats) {
  const current = stats[badge.field] || 0;
  return Math.min(1, current / badge.target);
}
