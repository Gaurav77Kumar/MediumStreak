/* Read markers: annotate links to articles already in your history with a
   "✓ Read" badge (plus a read-time estimate when the word count is known),
   right inside feeds and related-articles lists. Runs on every tracked site;
   scans are debounced so SPA feeds stay cheap. Links are matched by
   normalized exact address or by Medium's stable trailing post id.
*/

(() => {
  if (window.__msMarkersLoaded) return;
  window.__msMarkersLoaded = true;

  const WORDS_PER_MINUTE = 220;
  const RESCAN_DEBOUNCE_MS = 400;

  let enabled = true;
  let index = { byUrl: new Map(), byId: new Map() };
  let observer = null;
  let rescanTimer = null;

  // -- URL matching -------------------------------------------------------

  // Normalize for comparison: absolute, tracking params and hash stripped,
  // trailing slashes removed, http→https and www. collapsed.
  function normalizeUrl(value) {
    try {
      const u = new URL(value, location.href);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      for (const key of [...u.searchParams.keys()]) {
        if (/^(?:utm_.+|sk|source|ref|referrer|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) u.searchParams.delete(key);
      }
      u.hash = "";
      const path = u.pathname.replace(/\/+$/, "");
      const query = u.searchParams.toString();
      return `https://${u.hostname.replace(/^www\./, "")}${path}${query ? `?${query}` : ""}`;
    } catch (e) {
      return null;
    }
  }

  // Medium posts carry a stable 12–32 char hex id as the last URL segment
  // (slug-<id> or /p/<id>) that survives across domains and author formats.
  function postIdFromUrl(value) {
    try {
      const segments = new URL(value, location.href).pathname.replace(/\/+$/, "").split("/").filter(Boolean);
      const last = segments[segments.length - 1] || "";
      const match = last.match(/^(?:.*-)?([0-9a-f]{12,32})$/i);
      return match ? match[1].toLowerCase() : null;
    } catch (e) {
      return null;
    }
  }

  function entryMinutes(article) {
    return article.words ? Math.max(1, Math.round(article.words / WORDS_PER_MINUTE)) : null;
  }

  // Index counted history entries (the same "finished article" rule the
  // history list uses) under both their normalized URL and their post id.
  async function rebuildIndex() {
    try {
      const { articles = [] } = await chrome.storage.local.get("articles");
      const byUrl = new Map();
      const byId = new Map();
      for (const article of articles) {
        if (!article || typeof article.url !== "string") continue;
        const counted = typeof article.counted === "boolean"
          ? article.counted
          : (article.seconds || 0) >= (article.minArticleMin || 3) * 60;
        if (!counted) continue;
        const minutes = entryMinutes(article);
        const key = normalizeUrl(article.url);
        if (key && !byUrl.has(key)) byUrl.set(key, minutes);
        const id = postIdFromUrl(article.url);
        if (id && !byId.has(id)) byId.set(id, minutes);
      }
      index = { byUrl, byId };
    } catch (e) {
      /* storage unavailable (extension reloaded mid-read) — keep old index */
    }
  }

  function lookup(href) {
    const key = normalizeUrl(href);
    if (key && index.byUrl.has(key)) return { minutes: index.byUrl.get(key) };
    const id = postIdFromUrl(href);
    if (id && index.byId.has(id)) return { minutes: index.byId.get(id) };
    return null;
  }

  // -- Annotation ---------------------------------------------------------

  function annotate(link, minutes) {
    link.dataset.msRead = "1";
    const badge = document.createElement("span");
    badge.className = "ms-read-badge";
    badge.textContent = minutes ? `✓ Read · ~${minutes} min` : "✓ Read";
    link.appendChild(badge);
    // Title-only links get a gentle dim so unread ones pop; links that also
    // wrap an image stay untouched to avoid dimming thumbnails.
    if (!link.querySelector("img")) link.classList.add("ms-read-link");
  }

  function scan() {
    if (!enabled) return;
    for (const link of document.querySelectorAll("a[href]")) {
      if (link.dataset.msRead) continue;
      const hit = lookup(link.getAttribute("href") || "");
      if (hit) annotate(link, hit.minutes);
    }
  }

  function scheduleScan() {
    if (rescanTimer) return;
    rescanTimer = setTimeout(() => {
      rescanTimer = null;
      scan();
    }, RESCAN_DEBOUNCE_MS);
  }

  function startObserver() {
    if (observer || typeof MutationObserver === "undefined") return;
    const root = document.body || document.documentElement;
    if (!root) return;
    observer = new MutationObserver(scheduleScan);
    observer.observe(root, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (!observer) return;
    observer.disconnect();
    observer = null;
  }

  function clearMarkers() {
    document.querySelectorAll(".ms-read-badge").forEach((badge) => badge.remove());
    document.querySelectorAll("a.ms-read-link").forEach((link) => {
      link.classList.remove("ms-read-link");
      delete link.dataset.msRead;
    });
  }

  // Site removed in Settings → stop and wipe (same messages reader.js uses).
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "disableTracking") {
        enabled = false;
        stopObserver();
        clearMarkers();
      }
      if (msg && msg.type === "enableTracking" && !enabled) {
        enabled = true;
        startObserver();
        scan();
      }
    });
  }

  // New reading lands in history → refresh badges everywhere.
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.articles) return;
      rebuildIndex().then(scan);
    });
  }

  rebuildIndex().then(() => {
    scan();
    startObserver();
  });
})();
