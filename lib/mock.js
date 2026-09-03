const SAMPLE_TITLES = [
  "How I Learned to Stop Worrying and Love Async Code",
  "The Pragmatic Guide to Deep Work in a Noisy World",
  "Why Design Systems Fail (and How Yours Can Succeed)",
  "What 100 Rejected Pitches Taught Me About Writing",
  "A Gentle Introduction to Reading Research Papers",
  "Stop Optimizing Things That Don't Matter",
  "The Architecture of Habit: Building Systems That Stick",
  "Lessons From Shipping Software for a Decade",
  "How to Read 52 Books a Year Without Trying",
  "The Hidden Cost of Context Switching",
  "Notes on Writing Clearly, From Someone Still Learning",
  "What Makes a Great Code Review Great",
];

const TOPIC_POOL = [
  "software engineering",
  "productivity",
  "machine learning",
  "career advice",
  "writing",
  "design",
  "psychology",
  "startups",
  "data science",
  "web development",
];

(function () {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) return;

  const settings = {
    dailyGoalMin: 10,
    minArticleMin: 3,
    reminderEnabled: true,
    reminderHour: 20,
    digestEnabled: true,
    digestDay: 0,
    digestHour: 18,
    sites: ["substack.com"],
  };
  const days = {};
  const articles = [];

  // Seed ~4 months of plausible history ending with a 9-day live streak.
  const rand = mulberry32(42);
  const today = new Date();
  for (let i = 133; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const key = `${y}-${m}-${dd}`;
    const r = rand();
    const liveStreak = i < 9;
    if (liveStreak || r > 0.32) {
      const mins = liveStreak ? 8 + rand() * 25 : r > 0.75 ? 15 + rand() * 30 : 3 + rand() * 9;
      const nArticles = Math.max(1, Math.round(mins / 8));
      days[key] = { minutes: Math.round(mins * 10) / 10, articles: nArticles };
      for (let a = 0; a < nArticles; a++) {
        const tags = TOPIC_POOL.filter(() => rand() < 0.35).slice(0, 3);
        articles.push({
          url: `https://medium.com/@writer/sample-article-${key}-${a}`,
          title: SAMPLE_TITLES[Math.floor(rand() * SAMPLE_TITLES.length)],
          date: key,
          seconds: Math.round((3 + rand() * 14) * 60),
          words: Math.round(600 + rand() * 2200),
          topics: tags.length ? tags : [TOPIC_POOL[0]],
          starred: rand() < 0.08,
        });
      }
    } else {
      days[key] = { minutes: 0.5 + rand() * 2, articles: 0 };
    }
  }

  articles.sort((a, b) => (a.date < b.date ? 1 : -1));

  const store = {
    days,
    articles,
    settings,
    freeze: { count: 2, earned: 5 },
    readlater: [
      {
        url: "https://medium.com/swlh/why-everyone-should-write-a-newsletter-9f2a1c",
        title: "Why Everyone Should Write a Newsletter",
        addedAt: Date.now() - 36e5 * 20,
      },
      {
        url: "https://medium.com/better-programming/the-lost-art-of-the-design-doc-8a1b2c",
        title: "The Lost Art of the Design Doc",
        addedAt: Date.now() - 36e5 * 52,
      },
      {
        url: "https://medium.com/human-parts/how-to-take-a-real-break-4d1e2c",
        title: "How to Take a Real Break",
        addedAt: Date.now() - 36e5 * 90,
      },
    ],
    badges: {
      "first-article": "2026-05-02",
      "articles-10": "2026-05-20",
      "articles-50": "2026-07-14",
      "streak-3": "2026-05-04",
      "streak-7": "2026-06-01",
      "minutes-60": "2026-05-06",
      "minutes-600": "2026-07-02",
    },
  };

  window.chrome = {
    storage: {
      local: {
        get: async (keys) => {
          const out = {};
          const want = Array.isArray(keys) ? keys : [keys];
          for (const k of want) if (k in store) out[k] = store[k];
          return out;
        },
        set: async (obj) => Object.assign(store, obj),
        clear: async () => {
          store.days = {};
          store.articles = [];
          store.freeze = { count: 0, earned: 0 };
        },
      },
    },
    runtime: { openOptionsPage: () => alert("In the real extension this opens the dashboard tab."), sendMessage: async () => {} },
    permissions: { request: async () => true },
    action: {},
    notifications: {},
    alarms: {},
  };

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
})();
