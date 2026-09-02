/* Content script on medium.com — detects article pages and measures ACTIVE
 * reading time: tab visible + window focused + user interacted within the
 * last 60s. Sends periodic deltas to the background service worker.
 */
(() => {
  if (window.__mediumStreakLoaded) return;
  window.__mediumStreakLoaded = true;

  const IDLE_MS = 60 * 1000;       // no interaction for this long -> paused
  const TICK_MS = 5000;            // accumulate cadence
  const FLUSH_MS = 30 * 1000;      // report cadence
  const URL_CHECK_MS = 1500;       // Medium is an SPA; poll for navigation
  const MIN_ARTICLE_TEXT = 1500;   // story bodies, not feed cards

  let url = location.href;
  let articleEl = null;
  let sessionSeconds = 0;
  let lastActivity = Date.now();

  for (const evt of ["scroll", "wheel", "pointerdown", "pointermove", "keydown", "click", "touchstart"]) {
    window.addEventListener(evt, () => (lastActivity = Date.now()), { passive: true });
  }

  // A story page has an <article> with a real h1 title and a substantial body;
  // the homepage/feed also has <article> cards, but those are small and h1-less.
  function detectArticle() {
    const candidates = document.querySelectorAll("article");
    for (const el of candidates) {
      if (el.querySelector("h1") && el.textContent.trim().length > MIN_ARTICLE_TEXT) {
        return el;
      }
    }
    return null;
  }

  function isActivelyReading() {
    return (
      articleEl &&
      document.visibilityState === "visible" &&
      document.hasFocus() &&
      Date.now() - lastActivity < IDLE_MS
    );
  }

  function articleTitle() {
    const h1 = articleEl && articleEl.querySelector("h1");
    return ((h1 && h1.textContent) || document.title || "Untitled").trim().replace(/\s+/g, " ").slice(0, 200);
  }

  function articleWordCount() {
    if (!articleEl) return 0;
    return (articleEl.textContent.match(/\S+/g) || []).length;
  }

  // Medium articles link their topic tags as /tag/<slug> anchors.
  function articleTopics() {
    if (!articleEl) return [];
    const set = new Set();
    for (const a of articleEl.querySelectorAll('a[href*="/tag/"]')) {
      const m = (a.getAttribute("href") || "").match(/\/tag\/([^/?#]+)/);
      if (m) {
        try {
          set.add(decodeURIComponent(m[1]).replace(/-/g, " "));
        } catch (e) {
          set.add(m[1].replace(/-/g, " "));
        }
      }
      if (set.size >= 5) break;
    }
    return [...set];
  }

  // Normalize: Medium appends tracking params (?sk=...) that would split the
  // same article into multiple history entries.
  function canonicalUrl() {
    return location.origin + location.pathname;
  }

  function flush() {
    if (sessionSeconds <= 0) return;
    const seconds = sessionSeconds;
    sessionSeconds = 0;
    try {
      const p = chrome.runtime.sendMessage({
        type: "readingTick",
        seconds,
        url: canonicalUrl(),
        title: articleTitle(),
        words: articleWordCount(),
        topics: articleTopics(),
      });
      if (p && p.catch) p.catch(() => {});    // extension reloaded mid-read — drop the tick
    } catch (e) {
    }
  }

  setInterval(() => {
    if (isActivelyReading()) sessionSeconds += TICK_MS / 1000;
  }, TICK_MS);

  setInterval(flush, FLUSH_MS);

  // SPA navigation: Medium swaps content without a page load. When the URL
  // changes, bank the time read so far under the old URL and start fresh.
  setInterval(() => {
    if (location.href !== url) {
      flush();
      url = location.href;
      articleEl = null;
    }
    articleEl = detectArticle();
  }, URL_CHECK_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
})();
