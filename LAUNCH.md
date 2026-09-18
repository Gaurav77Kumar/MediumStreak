# 🚀 Launch Checklist — do this when the $5 is ready

Everything below is copy-paste ready. Estimated time: ~45 minutes.

## 0. Before you start (5 min)

- [ ] Edit `lib/config.js` — leave the placeholder for now (you'll get the real store URL in step 2).
- [ ] Edit `LICENSE` — replace `<Your Name>` with your name.
- [ ] Take a 2-day real-usage run of the unpacked extension on live Medium to confirm tracking works (if not already done).

## 1. Create the developer account & upload (10 min)

- [ ] Go to https://chrome.google.com/webstore/devconsole → sign in → pay $5.
- [ ] Build the zip: `python tools/package.py`
- [ ] Dev console → **New item** → upload `dist/mediumstreak-v1.1.0.zip` (version bumps automatically as long as you edit manifest.json first).
- [ ] Copy the item's store URL (visible in the dev console item page, even in draft).

## 2. Wire the store URL in (5 min)

- [ ] Paste the store URL into `lib/config.js`.
- [ ] Bump manifest version to 1.1.1 → `python tools/package.py` → upload the new zip over the draft. (Draft-only update = no extra review.)

## 3. Fill the store listing (15 min)

Copy-paste from `LISTING.md` in this repo:

- [ ] **Name:** MediumStreak — Reading Streak Tracker
- [ ] **Summary** (132 chars max) and **description**: from LISTING.md
- [ ] **Category:** Productivity
- [ ] **Screenshots:** your 5 images exported at **1280×800**
- [ ] **Privacy policy URL:** your hosted PRIVACY.md (step 4)

## 4. Host the privacy policy (5 min)

- [ ] Push the repo to GitHub (commands in section 6) → open PRIVACY.md on github.com → copy that URL.
- [ ] (Prettier option: repo Settings → Pages → enable GitHub Pages → use the Pages URL.)

## 5. Privacy tab + permissions justification (5 min)

- [ ] Privacy practices → select **"Does not collect user data"**.
- [ ] Add the permission justification paragraph from LISTING.md.

## 6. Push to GitHub (2 min)

```bash
git push -u origin main
```
(create the empty repo "MediumStreak" on github.com first — no README/gitignore there, this repo already has both)

## 7. Submit & launch

- [ ] Dev console → **Submit for review** (typically 1–5 days).
- [ ] While waiting: run the Reddit/X posts from the launch plan (they work even pre-approval — say "coming this week" if needed).
- [ ] After approval: install from the store link in a fresh Chrome profile to verify.
- [ ] Post the live store link as a comment on your Reddit/X posts.

## Future updates (30 seconds each)

1. Edit code → bump `version` in manifest.json
2. `python tools/package.py`
3. Dev console → your item → Package → upload new zip → Submit
