# MediumStreak — Privacy Policy

_Last updated: September 23, 2026_

MediumStreak ("the extension") tracks your article reading time so it can show
you a personal reading streak and heatmap.

**Short version: MediumStreak has no account, server, analytics, or automatic
network transmission. Reading data is stored locally in your browser and is
included only in files or images you explicitly export or share.**

## What data the extension stores

Everything below is saved only in your browser's local extension storage
(`chrome.storage.local`) and never leaves your device:

- Daily reading minutes and which days met your goal
- Article titles and URLs you read, with time spent, word count, and topics
- Your settings (daily goal, reminder time, tracked sites)
- Derived data: streaks, badges, reading list, read-later queue

## What we don't do

- We don't automatically transmit, sell, or share your reading data.
- We don't have accounts, servers, analytics, or trackers.
- We don't read the content of pages other than to detect that an article page
  is open and measure reading time on sites you chose to track.
- We don't modify the pages you visit, apart from adding a small
  extension-branded celebration toast when you reach your daily goal.

## Permissions and why each one exists

| Permission | Why |
| --- | --- |
| `storage` | Saves your streak data and settings on your device. |
| `alarms` | Powers the midnight streak rollover, streak freezes, and the reminders/recaps you opted into. |
| `notifications` | Evening reminders and weekly recaps are configurable; badge and streak-freeze notifications are generated locally by the extension. |
| `contextMenus` | Adds the right-click "Save to MediumStreak read later" option. |
| `scripting` | Injects the local reading-time tracker into sites you add in Settings. |
| Built-in host access | Medium, including its subdomains. |
| Optional host access | Requested when you add a site in Settings. A base domain includes its subdomains, both HTTP and HTTPS, and all ports on that host; Chrome shows the scope before you grant it. |

## Data removal

- **Reset all data…** in the dashboard's Settings tab deletes locally stored streak data.
- Uninstalling the extension deletes its local storage automatically.
- **Export** produces a JSON file of your data; the exported file is then stored wherever you choose. Share cards are generated locally and are only shared when you download or upload them.

## Third parties

None. The extension makes no network requests of its own. The only network
activity involved is the pages you choose to visit and files you choose to export or share.

