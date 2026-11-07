/* History resurfacing: while you read an article on a tracked site, show a
   small chip listing earlier reads on the same topics — your own context,
   right where you need it. Topics come from reader.js via the shared
   window.__msStreak hook; history comes from chrome.storage. Dismissal is
   remembered per article via sessionStorage.
*/

(() => {
  if (window.__msResurfaceLoaded) return;
  window.__msResurfaceLoaded = true;

  const POLL_MS = 3000;
  const MAX_ITEMS = 5;

  let disabled = false;
  let chip = null;
  let currentKey = "";

  function isCounted(article) {
    return typeof article.counted === "boolean"
      ? article.counted
      : (article.seconds || 0) >= (article.minArticleMin || 3) * 60;
  }

  function relDate(dateKey) {
    try {
      const [y, m, d] = dateKey.split("-").map(Number);
      const days = Math.max(0, Math.round((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000));
      if (days === 0) return "today";
      if (days === 1) return "yesterday";
      if (days < 7) return `${days} days ago`;
      if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
      if (days < 365) return `${Math.floor(days / 30)} month${days < 60 ? "" : "s"} ago`;
      return `${Math.floor(days / 365)} year${days < 730 ? "" : "s"} ago`;
    } catch (e) {
      return "";
    }
  }

  async function pastReads(article) {
    try {
      const { articles = [] } = await chrome.storage.local.get("articles");
      const topics = (article.topics || []).map((t) => String(t).toLowerCase()).filter(Boolean);
      if (!topics.length) return [];
      const here = String(article.url || "").replace(/\/+$/, "").toLowerCase();
      return articles
        .filter((a) => a && typeof a.url === "string" && a.url.replace(/\/+$/, "").toLowerCase() !== here)
        .filter(isCounted)
        .map((a) => {
          const shared = (a.topics || []).filter((t) => topics.includes(String(t).toLowerCase()));
          return {
            url: a.url,
            title: a.title || a.url,
            date: a.date,
            lastRead: a.lastRead || 0,
            shared,
          };
        })
        .filter((r) => r.shared.length)
        .sort((a, b) => b.lastRead - a.lastRead || (a.date < b.date ? 1 : -1))
        .slice(0, MAX_ITEMS);
    } catch (e) {
      return [];
    }
  }

  function removeChip() {
    if (chip) {
      chip.remove();
      chip = null;
    }
  }

  function render(article, reads) {
    removeChip();
    chip = document.createElement("div");
    chip.className = "ms-resurface";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ms-resurface-chip";
    const topTopic = reads[0].shared[0];
    button.textContent = `📚 ${reads.length} read${reads.length === 1 ? "" : "s"} on “${topTopic}” in your history`;
    button.title = "Articles from your own reading history on this topic";

    const popover = document.createElement("div");
    popover.className = "ms-resurface-pop";
    popover.hidden = true;

    const head = document.createElement("div");
    head.className = "ms-resurface-head";
    const headTitle = document.createElement("span");
    headTitle.textContent = "From your history";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "ms-resurface-close";
    closeButton.textContent = "✕";
    closeButton.title = "Dismiss for this article";
    closeButton.addEventListener("click", () => {
      try {
        sessionStorage.setItem(`ms-resurface-dismissed:${currentKey}`, "1");
      } catch (e) { /* storage may be unavailable — dismissal just won't persist */ }
      removeChip();
    });
    head.append(headTitle, closeButton);

    popover.appendChild(head);
    for (const read of reads) {
      const row = document.createElement("div");
      row.className = "ms-resurface-row";
      const link = document.createElement("a");
      link.href = read.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = read.title;
      link.title = read.url;
      const meta = document.createElement("span");
      meta.className = "ms-resurface-meta";
      meta.textContent = `${relDate(read.date)} · ${read.shared[0]}`;
      row.append(link, meta);
      popover.appendChild(row);
    }

    button.addEventListener("click", () => {
      popover.hidden = !popover.hidden;
    });

    chip.append(button, popover);
    document.documentElement.appendChild(chip);
  }

  async function attempt() {
    if (disabled || chip) return;
    const hook = window.__msStreak && window.__msStreak.getCurrentArticle;
    const article = typeof hook === "function" ? hook() : null;
    if (!article || !article.url || !Array.isArray(article.topics) || !article.topics.length) return;

    const key = String(article.url);
    if (key === currentKey) return;
    currentKey = key;

    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(`ms-resurface-dismissed:${key}`) === "1";
    } catch (e) { /* ignore */ }
    if (dismissed) return;

    const reads = await pastReads(article);
    if (disabled || currentKey !== key) return; // article changed mid-lookup
    if (reads.length) render(article, reads);
  }

  // SPA navigation swaps articles without reloading; the poll notices the
  // new current article (cheap no-op while the same article stays open).
  setInterval(attempt, POLL_MS);

  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "disableTracking") {
        disabled = true;
        removeChip();
      }
      if (msg && msg.type === "enableTracking" && disabled) {
        disabled = false;
      }
    });
  }
})();
