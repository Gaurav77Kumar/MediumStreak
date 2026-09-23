# MediumStreak 🔥


📦 Chrome Web Store:
https://chromewebstore.google.com/detail/hmhmagoboicnijknllomkennbappehei

A Privacy First Chrome Extension that that turns Your Medium Reading into a Streak with HeatMaps, Badges, and Reading Insights Where Each Days lights up based on minutes you actually read, plus streak counters, an article history, insights, badges and more.

All data stays **local** on your device (`chrome.storage`). No accounts, no servers.

![Overview — streak, heatmap, and article history](assets/Overview.png)

---

## How it works

- While you have a Medium **article** open (not the feed), the extension counts
  *active* reading time: tab visible + window focused + you interacted (scroll,
  click, move) within the last 60 s. Walk away and the clock pauses.
- A day counts toward the streak once your **daily goal** (default 10 min) is met.
- Articles you read for at least 3 minutes land in your **history**.
- Miss a day? A **streak freeze** ❄️ (earned for every 7-day streak) covers it
  automatically — Duolingo-style.
- Optionally get an evening **notification** if today's streak isn't secured yet.

---

## Features

### 📊 Streaks & tracking
- **Active-reading tracking** on Medium articles (visible tab + focus + recent interaction)
- **Streak heatmap** — popup mini view and a full-year dashboard view, with current/longest streak stats
- **Streak freeze** ❄️ — earn one per 7-day streak; missed days are auto-covered
- **"Streak secured" celebration** 🔥 — the moment you cross your daily goal mid-article, the page shows a toast + confetti (once per day)
- **Multi-site support** 🌐 — track Medium plus any article-based site you add (Substack, dev.to, personal blogs); Chrome asks per-site permission

### 🔔 Notifications
- **Evening reminder** notification (opt-in) when today's streak isn't secured
- **Weekly recap** notification 📊 — minutes read, active days, and streak for the last 7 days (day/time configurable)

### 🏆 Milestones & insights
- **Milestones & badges** — 13 badges across streaks, articles, hours, and words, with unlock notifications and progress bars
- **Reading insights** — words read, avg minutes per article/active day, best day, and weekday / 12-week / 12-month bar charts
- **Topics breakdown** 🏷️ — captures Medium article tags and shows what you read about, by article count

### 🔖 Reading list
- **Read later queue** — right-click any link anywhere → "Save to MediumStreak read later," managed in the Reading list tab
- **Reading list** ⭐ — star articles from history to save them (starred ones survive pruning)

### 📤 Sharing
- **Share card** — generates a 1200×630 PNG of your streak + heatmap for social
- **Reading Wrapped** 🎉 — a 1080×1350 "year in reading" card (hours, streaks, top topic) to post

### ⚙️ Everything else
- **Rating prompt** — appears once after 5 active days (never nags; "later" re-asks after 30 days). Set your store URL in `lib/config.js`.
- **Export / import** — JSON backups of everything

---

## Screenshots

### Insights
Words read, per-article/per-day averages, topic breakdown, and reading-by-weekday charts.

![Insights — words read, topics, and weekday charts](assets/Insight.png)

### Badges
13 milestones across streaks, articles, hours, and words read, with unlock dates and progress bars.

![Badges — milestones and unlock progress](assets/crack.png)

### Reading list
Read-later queue plus starred articles saved from your history.

![Reading list — read later queue and saved articles](assets/list.png)

### Settings
Daily goal, minimum minutes to log an article, tracked sites, reminders, and the weekly recap schedule.

![Settings — goals, tracked sites, and notifications](assets/setting.png)

### Reading Wrapped
A shareable "year in reading" card — hours read, articles, streaks, top topic, and best day.

![Reading Wrapped — shareable year-in-review card](assets/wrapped.png)

---

## Roadmap ideas (v1.3+)

- **Per-site reading stats** — show minutes, articles, topics, and streaks separately for Medium and custom sites.
- **Smart streak-at-risk reminders** — suggest reading when the daily goal is almost complete and the streak may be missed.
- **Temporary pause mode** — pause tracking for a selected period, such as during travel or downtime.
- **Weekly reading challenges** — encourage consistent reading with optional challenges and achievements.
- **History search and filters** — quickly find past articles by title, topic, date, or website.

