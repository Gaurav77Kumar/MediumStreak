# Store listing 

## Name
MediumStreak — Reading Streak Tracker

## Summary (132 chars max)
Duolingo-style reading streaks for Medium & your favorite blogs. Heatmap, freezes, badges — 100% private, all data stays on-device.

## Description
Turn your reading into a streak you don't want to break 🔥

MediumStreak works like LeetCode's contribution graph, but for reading: every day you hit your reading goal lights up on a heatmap, and a Duolingo-style streak keeps you coming back.

⏱️ REAL READING, NOT OPEN TABS
The tracker only counts when you're actually reading — tab visible, window focused, you've interacted in the last minute. Walk away and the clock pauses. No fake streaks.

🔥 THE STREAK SYSTEM
• Set a daily goal (default: 10 minutes)
• Hit it → the day lights up on your heatmap
• Miss a day? A Streak Freeze (earned every 7-day streak) saves you automatically
• Evening reminder when today's streak isn't secured yet (optional)

🏆 31 BADGES TO UNLOCK
From "First Steps" to "Word Millionaire" — streaks, articles, hours, and words milestones with unlock notifications.

📊 READING INSIGHTS
Words read, average session length, best reading day, minutes by weekday, weekly and monthly trends — plus a topics breakdown of what you actually read about.

🌐 WORKS BEYOND MEDIUM
Track Medium out of the box. Add Substack, dev.to, or any article-based blog in Settings — everything flows into one heatmap.

🔖 READ LATER
Right-click any link anywhere → "Save to read later" — your queue lives in the dashboard.

🎉 SHARE YOUR PROGRESS
One-click share cards and a "Reading Wrapped" year-in-review image, ready for social.

🔒 PRIVATE BY DESIGN
No account. No server. No analytics. Everything is stored on your device and never leaves your browser. One click exports all your data as JSON, or wipes it forever.

Install it, read something great, and don't break the streak.

---

## Permission justification (paste into the review/permissions section)

All functionality is on-device. `storage` keeps reading stats local; `alarms` powers the daily rollover and user-configured reminders; `notifications` are opt-in reminders, recaps, and badge alerts; `contextMenus` adds the right-click "Save to read later" action. Host access to medium.com reads article pages to measure active reading time. `scripting` + optional host permissions are used only when the user adds an extra reading site in Settings, injecting the same local-only tracker into that site. No data ever leaves the browser.

## Privacy tab answers
- Data usage: **Does not collect user data** (single compliance check)
- Privacy policy URL:  GitHub-hosted PRIVACY.md link

## Screenshot captions (use under each of the 5 images if you want)
1. "Your reading year at a glance"
2. "Know exactly what you read about"
3. "Badges for every milestone"
4. "Your reading Wrapped — made for sharing"
5. "Add any blog you read"
