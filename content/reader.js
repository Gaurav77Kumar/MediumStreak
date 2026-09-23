/* Content script on medium.com — detects article pages and measures ACTIVE
   reading time: tab visible + window focused + user interacted within the
   last 60s. Sends periodic deltas to the background service worker.
 */
(() => {
  if (window.__mediumStreakLoaded) return;
  window.__mediumStreakLoaded = true;

  const IDLE_MS = 60 * 1000;       // no interaction for this long -> paused
  const TICK_MS = 5000;            // accumulate cadence
  const FLUSH_MS = 30 * 1000;      // report cadence
  const URL_CHECK_MS = 1500;       // Medium is an SPA; poll for navigation
  const MIN_ARTICLE_TEXT = 300;    // fallback heuristic: story bodies, not feed cards
  const POINTER_MOVE_THRESHOLD = 30;

  let url = "";
  let articleEl = null;
  let activeArticle = null;
  let sessionSeconds = 0;
  let trackingEnabled = true;
  let lastActivity = 0;
  let hasReadingGesture = false;
  let lastPointerX = null;
  let lastPointerY = null;
  let refreshTimer = null;
  let articleObserver = null;

  function markReadingActivity() {
    hasReadingGesture = true;
    lastActivity = Date.now();
  }

  function markActivity() {
    if (hasReadingGesture) lastActivity = Date.now();
  }

  function resetReadingActivity() {
    hasReadingGesture = false;
    lastActivity = 0;
    lastPointerX = null;
    lastPointerY = null;
  }

  function markPointerActivity(event) {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    if (
      lastPointerX === null ||
      Math.hypot(event.clientX - lastPointerX, event.clientY - lastPointerY) >= POINTER_MOVE_THRESHOLD
    ) {
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      markActivity();
    }
  }

  for (const evt of ["scroll", "wheel", "keydown"]) {
    window.addEventListener(evt, markReadingActivity, { passive: true });
  }
  for (const evt of ["pointerdown", "click", "touchstart"]) {
    window.addEventListener(evt, markActivity, { passive: true });
  }
  window.addEventListener("pointermove", markPointerActivity, { passive: true });
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === "disableTracking") {
        trackingEnabled = false;
        sessionSeconds = 0;
        stopArticleObserver();
        resetReadingActivity();
      }
      if (message && message.type === "enableTracking") {
        trackingEnabled = true;
      }
    });
  }

  const MIN_ARTICLE_WORDS = 80;
  const ARTICLE_TYPES = new Set([
    "article",
    "blogposting",
    "newsarticle",
    "techarticle",
    "scholarlyarticle",
    "report",
  ]);
  const ARTICLE_BODY_SELECTORS = [
    "[itemprop='articleBody']",
    "[data-testid='article-content']",
    "[data-testid='article-body']",
    "[data-testid='post-content']",
    "[data-testid='post-body']",
    "[data-testid='entry-content']",
    ".article-body",
    ".article-content",
    ".entry-content",
    ".post-content",
    ".post-body",
    ".prose",
    ".article__body",
    ".post__body",
    ".post__content",
    ".single-post-content",
    ".available-content",
    ".markdown-body",
    ".post",
    ".entry",
    "#content",
    "#main-content",
    "[data-article]",
    "[data-content]",
    "[id='article-body']",
    "[role='article']",
    "article",
  ];
  const NON_ARTICLE_PATH = /^\/(?:feed|latest|archive|search|tag|tags|topic|topics|t|author|authors|user|users|team|members|member|people|category|categories|about|privacy|terms|login|signin|sign-in|signup|register|explore|notifications|settings|home|publication|profile|pricing|plans|features|contact|faq|careers|jobs|series|rss|newsletter|collection|gallery)(?:\/|$)/i;
  const LISTING_PATH = /^\/(?:blog|posts)\/?$/i;
  const ARTICLE_PATH_HINT = /(?:^|\/)(?:p|posts?|articles?|story|stories|read|reading|entry|blog)(?:\/|$)/i;
  const ARTICLE_QUERY_KEYS = ["p", "id", "article", "article_id", "post", "post_id", "story"];
  const MAX_TOPICS = 5;
  const WORD_COUNT_EXCLUDED_SELECTORS = [
    "script",
    "style",
    "noscript",
    "template",
    "header",
    "nav",
    "footer",
    "aside",
    "form",
    "[role='navigation']",
    "[role='complementary']",
    "[role='contentinfo']",
    "[id*='comment' i]",
    "[class*='comment' i]",
    "[data-testid*='comment' i]",
    "[id*='related' i]",
    "[class*='related' i]",
    "[data-testid*='related' i]",
    "[id*='recommend' i]",
    "[class*='recommend' i]",
    "[data-testid*='recommend' i]",
    "[id*='newsletter' i]",
    "[class*='newsletter' i]",
    "[data-testid*='newsletter' i]",
    "[id*='subscribe' i]",
    "[class*='subscribe' i]",
    "[data-testid*='subscribe' i]",
    "[role='toolbar']",
    "[class*='author' i]",
    "[id*='author' i]",
    "[data-testid*='author' i]",
    "[class*='byline' i]",
    "[class*='share' i]",
    "[class*='social' i]",
    "[class*='reaction' i]",
    "[class*='topic' i]",
    "[class*='tag' i]",
    "[data-testid*='topic' i]",
    "[data-testid*='tag' i]",
    "a[href*='/tag/' i]",
    "a[href*='/tags/' i]",
    "a[href*='/t/' i]",
    "a[rel~='tag']",
  ];
  const WORD_COUNT_ROOT_EXCLUDED_SELECTORS = [
    "script",
    "style",
    "noscript",
    "template",
    "header",
    "nav",
    "footer",
    "aside",
    "form",
    "[role='navigation']",
    "[role='complementary']",
    "[role='contentinfo']",
  ];

  function isArticleType(type) {
    const types = Array.isArray(type) ? type : [type];
    return types.some((value) => {
      const name = String(value || "").split(/[\/#]/).pop().toLowerCase();
      return ARTICLE_TYPES.has(name);
    });
  }

  function findStructuredArticles(value, articles = []) {
    if (Array.isArray(value)) {
      for (const item of value) findStructuredArticles(item, articles);
      return articles;
    }
    if (!value || typeof value !== "object") return articles;
    if (isArticleType(value["@type"])) articles.push(value);
    for (const key of ["@graph", "mainEntity"]) findStructuredArticles(value[key], articles);
    return articles;
  }

  function normalizeArticlePath(path) {
    const normalized = path.replace(/\/+$/, "");
    return normalized || "/";
  }

  function sameArticleQuery(left, right) {
    const leftQuery = new URLSearchParams(left);
    const rightQuery = new URLSearchParams(right);
    for (const key of ARTICLE_QUERY_KEYS) {
      const leftHasKey = leftQuery.has(key);
      const rightHasKey = rightQuery.has(key);
      if (leftHasKey || rightHasKey) {
        if (!leftHasKey || !rightHasKey || leftQuery.get(key) !== rightQuery.get(key)) return false;
      }
    }
    return true;
  }

  function structuredArticleMatchesPage(article) {
    const current = new URL(location.href);
    const candidates = [];
    if (typeof article.url === "string") candidates.push(article.url);
    if (typeof article["@id"] === "string") candidates.push(article["@id"]);
    if (typeof article.mainEntityOfPage === "string") candidates.push(article.mainEntityOfPage);
    else if (article.mainEntityOfPage && typeof article.mainEntityOfPage === "object") {
      if (typeof article.mainEntityOfPage.url === "string") candidates.push(article.mainEntityOfPage.url);
      if (typeof article.mainEntityOfPage["@id"] === "string") candidates.push(article.mainEntityOfPage["@id"]);
    }
    if (!candidates.length) return true;
    return candidates.some((value) => {
      try {
        const candidate = new URL(value, location.href);
        if (candidate.origin !== current.origin) return false;
        if (normalizeArticlePath(candidate.pathname) !== normalizeArticlePath(current.pathname)) return false;
        if (!sameArticleQuery(current.search, candidate.search)) return false;
        if (isArticleHash(current.hash) && current.hash !== candidate.hash) return false;

        return true;
      } catch (e) {
        return false;
      }
    });
  }

  function structuredArticle() {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const found = findStructuredArticles(JSON.parse(script.textContent || ""));
        for (const article of found) {
          if (structuredArticleMatchesPage(article)) return article;
        }
      } catch (e) {
      }
    }
    return null;
  }

  function metaContent(selector) {
    const element = document.querySelector(selector);
    return element && element.getAttribute("content")
      ? element.getAttribute("content").trim()
      : "";
  }

  function hasArticleMetadata() {
    const type = metaContent('meta[property="og:type"]').toLowerCase();
    return type === "article" || Boolean(
      metaContent('meta[property="article:published_time"]') ||
      metaContent('meta[property="article:modified_time"]')
    );
  }

  function findArticleTitleElement() {
    const selectors = [
      'h1[data-testid="storyTitle"]',
      '[itemprop="headline"]',
      '[data-testid="article-title"]',
      '[data-testid="post-title"]',
      ".post-title",
      ".entry-title",
      ".article-title",
      "article h1",
      "main h1",
      "h1",
    ];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && (element.textContent || "").trim()) return element;
    }
    return null;
  }

  function isMediumHost() {
    return /(^|\.)medium\.com$/i.test(location.hostname);
  }

  function isMediumProfilePath() {
    if (!isMediumHost()) return false;
    const segments = location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (!segments[0] || !segments[0].startsWith("@")) return false;
    const last = (segments[segments.length - 1] || "").toLowerCase();
    return segments.length === 1 || !/[0-9a-f]{8,}/i.test(last) || ["reposts", "activity", "lists", "followers", "following"].includes(last);
  }

  function isMediumArticlePath() {
    const path = location.pathname.replace(/\/+$/, "");
    if (NON_ARTICLE_PATH.test(path) || LISTING_PATH.test(path) || isMediumProfilePath()) return false;
    return isMediumHost() && /\/[0-9a-f]{8,}$/i.test(path);
  }

  function isCommentPath() {
    return /\/comments?(?:\/|$)/i.test(location.pathname);
  }

  function isArticleHash(hash) {
    return /^\#(?:\/|article\/|post\/|story\/)/i.test(hash || "");
  }

  function isLikelyArticlePath() {
    const path = location.pathname.replace(/\/+$/, "");
    if (path) {
      const segments = path.split("/").filter(Boolean);
      if (isMediumProfilePath()) return false;
      if (segments[0] && segments[0].startsWith("@") && (!isMediumHost() || segments.length === 1)) return false;
      if (/(^|\.)dev\.to$/i.test(location.hostname) && segments.length === 1) return false;
      if (LISTING_PATH.test(path)) return false;
      return !NON_ARTICLE_PATH.test(path);
    }
    const query = new URLSearchParams(location.search);
    return ARTICLE_QUERY_KEYS.some((key) => query.has(key)) || isArticleHash(location.hash);
  }

  function bodyWords(text) {
    return (text.match(/\S+/g) || []).length;
  }

  function cloneArticleElement(element) {
    if (!element || element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return null;
    if (WORD_COUNT_ROOT_EXCLUDED_SELECTORS.some((selector) => element.matches(selector))) return null;
    const clone = element.cloneNode(true);
    for (const selector of WORD_COUNT_EXCLUDED_SELECTORS) {
      for (const descendant of clone.querySelectorAll(selector)) descendant.remove();
    }
    for (const hidden of clone.querySelectorAll("[hidden], [aria-hidden='true']")) hidden.remove();
    return clone;
  }

  function cleanArticleText(element) {
    const clone = cloneArticleElement(element);
    return clone ? (clone.textContent || "").replace(/\s+/g, " ").trim() : "";
  }

  function isSubstantiveBody(text, words) {
    return words >= MIN_ARTICLE_WORDS || text.length >= MIN_ARTICLE_TEXT;
  }

  function bodyCandidateMetrics(element, cleanElement, text, words) {
    const descendants = cleanElement.querySelectorAll("*").length;
    const paragraphs = cleanElement.querySelectorAll("p");
    let paragraphTextLength = 0;
    for (const paragraph of paragraphs) {
      paragraphTextLength += (paragraph.textContent || "").replace(/\s+/g, " ").trim().length;
    }
    const images = cleanElement.querySelectorAll("img, picture, video, svg").length;
    const headingLevels = [...cleanElement.querySelectorAll("h1, h2, h3, h4, h5, h6")]
      .map((heading) => Number(heading.tagName.slice(1)))
      .filter(Boolean);
    const uniqueLevels = [...new Set(headingLevels)].sort((a, b) => a - b);
    let headingSkips = 0;
    for (let i = 1; i < uniqueLevels.length; i++) {
      if (uniqueLevels[i] > uniqueLevels[i - 1] + 1) headingSkips++;
    }
    const semanticSelector = "article, main, section, [role='main'], [itemprop='articleBody']";
    const semanticTags = cleanElement.querySelectorAll(semanticSelector).length + (cleanElement.matches(semanticSelector) ? 1 : 0);
    const htmlLength = typeof cleanElement.innerHTML === "string" ? cleanElement.innerHTML.length : text.length;
    return {
      element,
      words,
      substantive: isSubstantiveBody(text, words),
      text,
      paragraphCount: paragraphs.length,
      paragraphDensity: text.length ? paragraphTextLength / text.length : 0,
      textToHtmlRatio: htmlLength ? text.length / htmlLength : 1,
      semanticTags,
      headingCount: headingLevels.length,
      headingSkips,
      imageDensity: descendants ? images / descendants : 0,
      hasH1: Boolean(cleanElement.querySelector("h1")),
    };
  }

  function bodyCandidateScore(candidate) {
    const element = candidate.element;
    let score = Math.min(candidate.words, 600);
    if (element.matches("[itemprop='articleBody']")) score += 2800;
    if (element.matches("article")) score += 1700;
    if (element.matches("[id='article-body'], [role='article']")) score += 2600;
    if (element.matches("[data-testid='article-content'], [data-testid='article-body'], [data-testid='post-content'], [data-testid='post-body'], [data-testid='entry-content']")) score += 2400;
    if (element.matches(".article-body, .article-content, .entry-content, .post-content, .post-body, .prose, .article__body, .post__body, .post__content, .single-post-content, .available-content")) score += 2200;
    if (element.matches(".markdown-body, #content, #main-content, [data-article], [data-content]")) score += 1900;
    if (element.matches(".post, .entry")) score += 1600;
    score += Math.min(candidate.paragraphCount, 10) * 10;
    if (candidate.hasH1) score += 50;
    score += Math.min(candidate.paragraphDensity, 1) * 120;
    score += Math.min(candidate.textToHtmlRatio, 1) * 100;
    score += Math.min(candidate.semanticTags, 4) * 25;
    score += Math.min(candidate.headingCount, 6) * 8;
    score -= candidate.headingSkips * 20;
    score -= Math.min(candidate.imageDensity, 0.25) * 500;
    return score;
  }

  function addBodyCandidates(selector, candidates, seen) {
    for (const element of document.querySelectorAll(selector)) {
      if (seen.has(element)) continue;
      seen.add(element);
      const cleanElement = cloneArticleElement(element);
      if (!cleanElement) continue;
      const text = (cleanElement.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      candidates.push(bodyCandidateMetrics(element, cleanElement, text, bodyWords(text)));
    }
  }

  function findArticleBody(hasStructuredArticle = false) {
    const specific = [];
    const main = [];
    const seen = new Set();
    for (const selector of ARTICLE_BODY_SELECTORS) {
      addBodyCandidates(selector, specific, seen);
    }
    addBodyCandidates("main", main, seen);

    const substantiveSpecific = specific.filter((candidate) => candidate.substantive);
    const substantiveMain = main.filter((candidate) => candidate.substantive);
    if (substantiveSpecific.length) {
      substantiveSpecific.sort((a, b) => bodyCandidateScore(b) - bodyCandidateScore(a));
      return substantiveSpecific[0].element;
    }
    if (substantiveMain.length) {
      substantiveMain.sort((a, b) => bodyCandidateScore(b) - bodyCandidateScore(a));
      return substantiveMain[0].element;
    }
    if (hasStructuredArticle && document.body) {
      const ignored = new Set(["SCRIPT", "STYLE", "LINK", "META", "NAV", "HEADER", "FOOTER", "ASIDE"]);
      const roots = [...document.body.children].filter((element) => !ignored.has(element.tagName));
      if (roots.length === 1) return roots[0];
    }
    const pool = specific.length ? specific : main;
    pool.sort((a, b) => bodyCandidateScore(b) - bodyCandidateScore(a));
    return pool.length ? pool[0].element : null;
  }

  function isProfileOrListingPage(body) {
    const marker = "[class*='profile'], [data-testid*='profile'], [class*='feed'], [data-testid*='feed'], [class*='archive'], [data-testid*='archive'], [class*='collection'], [data-testid*='collection']";
    let root = body;
    while (root) {
      if (root.matches(marker) || root.matches("#articles-list") || root.querySelector("#articles-list")) return true;
      if (root === document.body) break;
      root = root.parentElement;
    }
    return false;
  }

  function detectArticle() {
    if (isCommentPath()) return null;

    const mediumTitle = document.querySelector('h1[data-testid="storyTitle"]');
    if (mediumTitle) {
      return mediumTitle.closest("article") || mediumTitle.closest("section") || document.body;
    }

    if (!isMediumArticlePath() && !isLikelyArticlePath()) return null;

    const structured = structuredArticle();
    const body = findArticleBody(Boolean(structured));
    if (!body) return null;
    const cleanBody = cloneArticleElement(body);
    if (!cleanBody) return null;
    const hasMetadata = hasArticleMetadata();
    const hasTitle = Boolean(
      findArticleTitleElement() || metaContent('meta[property="og:title"]') || document.title.trim()
    );
    const semanticBody = cleanBody.matches("main") || ARTICLE_BODY_SELECTORS.some((selector) => cleanBody.matches(selector));
    const strongBody = cleanBody.matches(
      "article, [role='article'], [itemprop='articleBody'], [id='article-body'], [data-testid='article-content'], [data-testid='article-body'], [data-testid='post-content'], [data-testid='post-body'], [data-testid='entry-content'], .article-body, .article-content, .entry-content, .post-content, .post-body, .available-content, .markdown-body, #article-body"
    );
    const hasParagraph = Boolean(cleanBody.querySelector("p"));
    const hasPathHint = ARTICLE_PATH_HINT.test(location.pathname) || isArticleHash(location.hash) || ARTICLE_QUERY_KEYS.some((key) => new URLSearchParams(location.search).has(key));

    if (!hasTitle || isProfileOrListingPage(body)) return null;
    if (!structured && !hasMetadata && !strongBody && !hasPathHint) return null;
    if (!structured && !hasMetadata && (!semanticBody || !hasParagraph)) return null;


    return body;
  }

  function isActivelyReading() {
    return (
      articleEl &&
      trackingEnabled &&
      hasReadingGesture &&
      lastActivity > 0 &&
      document.visibilityState === "visible" &&
      document.hasFocus() &&
      Date.now() - lastActivity < IDLE_MS
    );
  }

  function articleTitle() {
    const titleElement = (articleEl && articleEl.querySelector("h1")) || findArticleTitleElement();
    return ((titleElement && titleElement.textContent) || document.title || "Untitled").trim().replace(/\s+/g, " ").slice(0, 200);
  }

  function articleWordText() {
    return cleanArticleText(articleEl);
  }

  function articleWordCount() {
    return bodyWords(articleWordText());
  }

  function topicValues(value) {
    if (Array.isArray(value)) {
      const values = [];
      for (const item of value) values.push(...topicValues(item));
      return values;
    }
    if (value && typeof value === "object") {
      return topicValues(value.name || value.value || value.term || "");
    }
    if (value === null || value === undefined) return [];
    return String(value)
      .split(/\s*(?:,|;|\n)\s*/)
      .map((item) => item.replace(/^#/, "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  function addTopic(topics, value) {
    for (const topic of topicValues(value)) {
      const normalized = topic.slice(0, 80);
      const key = normalized.toLowerCase();
      if (normalized && !topics.has(key)) topics.set(key, normalized);
    }
  }

  function addHrefTopic(topics, anchor) {
    const href = anchor.getAttribute("href") || "";
    let route = href;
    let queryRoute = "";
    try {
      const parsed = new URL(href, location.href);
      const currentIsWeb = /^(?:https?:)$/i.test(location.protocol);
      if (
        currentIsWeb &&
        (!/^(?:https?:)$/i.test(parsed.protocol) || parsed.origin !== location.origin)
      ) return;
      route = parsed.pathname + parsed.search + parsed.hash;
      queryRoute = parsed.searchParams.get("topic") || parsed.searchParams.get("tag") || parsed.searchParams.get("tags") || "";
    } catch (e) {
    }
    const match = route.match(/(?:^|\/)(?:tag|tags|t)\/([^/?#]+)/i) ||
      queryRoute.match(/(?:^|\/)(?:tag|tags|t)\/([^/?#]+)/i);
    if (match) {
      let slug = match[1];
      try {
        slug = decodeURIComponent(slug);
      } catch (e) {
      }
      addTopic(topics, slug.replace(/[-_]+/g, " "));
      return;
    }
    if (/\btag\b/i.test(anchor.getAttribute("rel") || "")) {
      let label = (anchor.textContent || "").trim();
      if (!label && href) {
        try {
          label = new URL(href, location.href).pathname.split("/").filter(Boolean).pop() || "";
        } catch (e) {
        }
      }
      addTopic(topics, label || href);
    }
  }

  function addStructuredTopics(topics) {
    const article = structuredArticle();
    if (!article) return;
    for (const key of ["keywords", "articleSection", "about", "subject", "genre"]) {
      addTopic(topics, article[key]);
    }
  }

  function addMetaTopics(topics) {
    for (const selector of [
      'meta[name="keywords"]',
      'meta[property="keywords"]',
      'meta[name="news_keywords"]',
      'meta[property="article:section"]',
      'meta[property="article:tag"]',
      'meta[property="article:tags"]',
      'meta[name="tags"]',
    ]) {
      for (const element of document.querySelectorAll(selector)) {
        addTopic(topics, element.getAttribute("content") || "");
      }
    }
  }

  function articleTopics() {
    if (!articleEl) return [];
    const topics = new Map();
    const topicRoot = articleEl.closest("article, [role='article']") || articleEl;
    const semanticTags = [...topicRoot.querySelectorAll('a[rel~="tag"]')];
    const hrefTags = [...topicRoot.querySelectorAll(
      'a[href*="tag/"], a[href*="tags/"], a[href*="t/"]'
    )];
    for (const anchor of [...new Set([...semanticTags, ...hrefTags])]) {
      if (anchor.closest("nav, footer, aside, [class*='related' i], [class*='recommend' i], [class*='comment' i]")) continue;
      addHrefTopic(topics, anchor);
      if (topics.size >= MAX_TOPICS) break;
    }
    if (topics.size) return [...topics.values()].slice(0, MAX_TOPICS);
    addStructuredTopics(topics);
    if (topics.size) return [...topics.values()].slice(0, MAX_TOPICS);
    addMetaTopics(topics);
    return [...topics.values()].slice(0, MAX_TOPICS);
  }

  function articleSnapshot() {
    if (!articleEl) return null;
    return {
      url: canonicalUrl(),
      title: articleTitle(),
      words: articleWordCount(),
      topics: articleTopics(),
    };
  }

  // Normalize: Medium appends tracking params (?sk=...) that would split the
  // same article into multiple history entries.
  function canonicalUrl(value = location.href) {
    try {
      let page = new URL(value, location.href);
      const canonical = document.querySelector('link[rel="canonical"]');
      if (canonical && canonical.href) {
        const linked = new URL(canonical.href, page.href);
        const samePath = linked.origin === page.origin &&
          linked.pathname.replace(/\/+$/, "") === page.pathname.replace(/\/+$/, "");
        const sameQuery = sameArticleQuery(page.search, linked.search);
        const currentHash = page.hash;
        const hashCompatible = !isArticleHash(currentHash) ||
          !isArticleHash(linked.hash) || linked.hash === currentHash;
        if (samePath && sameQuery && hashCompatible && (linked.search || !page.search)) {
          page = linked;
          if (isArticleHash(currentHash) && !isArticleHash(page.hash)) page.hash = currentHash;
        }
      }
      const query = new URLSearchParams(page.search);
      for (const key of [...query.keys()]) {
        if (
          /^(?:utm_.+|sk|fbclid|gclid|mc_cid|mc_eid)$/i.test(key) ||
          (isMediumHost() && /^(?:source|ref|referrer)$/i.test(key))
        ) {
          query.delete(key);
        }
      }
      const search = query.toString();
      const hash = isArticleHash(page.hash) ? page.hash : "";
      return page.origin + page.pathname + (search ? `?${search}` : "") + hash;
    } catch (e) {
      return location.origin + location.pathname + location.search + (isArticleHash(location.hash) ? location.hash : "");
    }
  }

  function flush() {
    if (sessionSeconds <= 0) return;
    const seconds = sessionSeconds;
    sessionSeconds = 0;
    const article = activeArticle;
    if (!article) return;
    try {
      const p = chrome.runtime.sendMessage({
        type: "readingTick",
        seconds,
        url: article.url,
        title: article.title,
        words: article.words,
        topics: article.topics,
      });
      if (p && p.catch) p.catch(() => {});    // extension reloaded mid-read — drop the tick
    } catch (e) {
    }
  }

  setInterval(() => {
    if (isActivelyReading()) sessionSeconds += TICK_MS / 1000;
  }, TICK_MS);

  setInterval(flush, FLUSH_MS);

  function stopArticleObserver() {
    if (!articleObserver) return;
    articleObserver.disconnect();
    articleObserver = null;
  }

  function observeArticleMutations() {
    if (articleObserver || typeof MutationObserver === "undefined") return;
    const observationRoot = document.body || document.documentElement;
    if (!observationRoot) return;
    try {
      articleObserver = new MutationObserver(scheduleArticleRefresh);
      articleObserver.observe(observationRoot, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    } catch (e) {
      articleObserver = null;
    }
  }

  function refreshArticle() {
    const currentUrl = canonicalUrl();
    if (url && currentUrl !== url) {
      flush();
      url = currentUrl;
      articleEl = null;
      activeArticle = null;
      stopArticleObserver();
      resetReadingActivity();
      return;
    }
    url = currentUrl;

    const previousElement = articleEl;
    articleEl = detectArticle();
    const nextSnapshot = articleSnapshot();
    const previousSnapshot = activeArticle;
    const articleChanged = Boolean(
      (nextSnapshot && !previousSnapshot) ||
      (!nextSnapshot && previousSnapshot) ||
      (nextSnapshot && previousSnapshot && nextSnapshot.url !== previousSnapshot.url) ||
      (nextSnapshot && previousSnapshot && previousElement !== articleEl && nextSnapshot.title !== previousSnapshot.title)
    );
    if (articleChanged) {
      if (sessionSeconds > 0) flush();
      resetReadingActivity();
    }
    activeArticle = nextSnapshot;
    if (articleEl && trackingEnabled) observeArticleMutations();
    else stopArticleObserver();
  }

  function scheduleArticleRefresh() {
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refreshArticle();
    }, 100);
  }

  setInterval(refreshArticle, URL_CHECK_MS);

  refreshArticle();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
  window.addEventListener("popstate", refreshArticle);
  window.addEventListener("hashchange", refreshArticle);
})();
