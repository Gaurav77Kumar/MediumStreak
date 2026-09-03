/* "Year in Reading" Wrapped card: a 1080x1350 portrait summary of the last
365 days, designed to be posted. Uses shared helpers from sharecard.js
(SHARE_COLORS, levelFor, roundRectPath) — load it after sharecard.js.
 */

function wrappedYearStats(days, articles, settings, today = new Date()) {
  const startKey = localDateKey(addDays(today, -364));
  const window = {};
  for (const k of Object.keys(days)) {
    if (k >= startKey) window[k] = days[k];
  }
  const stats = computeStats(window, settings); 
  const sum = summarizeReading(window, articles, settings);
  const topics = topicDistribution(articles, settings);
  return { stats, sum, topTopic: topics.topics[0] || null };
}

function drawWrapped(canvas, { days, articles, settings, today = new Date() }) {
  const W = 1080;
  const H = 1350;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const C = SHARE_COLORS;
  const sans = `-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

  const { stats, sum, topTopic } = wrappedYearStats(days, articles, settings, today);
  const year = today.getFullYear();

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, C.bg0);
  grad.addColorStop(0.6, "#0d1a12");
  grad.addColorStop(1, C.bg1);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2;
  roundRectPath(ctx, 24, 24, W - 48, H - 48, 28);
  ctx.stroke();

  ctx.fillStyle = C.muted;
  ctx.font = `700 30px ${sans}`;
  ctx.fillText("🔥 MEDIUMSTREAK", 80, 112);
  ctx.font = `700 30px ${sans}`;
  ctx.textAlign = "right";
  ctx.fillText(String(year), W - 80, 112);
  ctx.textAlign = "left";

  ctx.fillStyle = C.accent;
  ctx.font = `800 104px ${sans}`;
  ctx.fillText("READING", 76, 250);
  ctx.fillStyle = C.text;
  ctx.fillText("WRAPPED", 76, 360);

  // Hero: hours read
  const hours = Math.round(stats.totalMinutes / 60);
  ctx.fillStyle = C.accent;
  ctx.font = `800 190px ${sans}`;
  ctx.fillText(String(hours), 74, 580);
  ctx.fillStyle = C.muted;
  ctx.font = `700 36px ${sans}`;
  ctx.fillText("HOURS OF READING", 82, 636);

  // Stats grid (2x2)
  const cells = [
    { v: String(stats.totalArticles), k: "articles read" },
    { v: String(stats.totalActiveDays), k: "days on streak" },
    { v: String(stats.longestStreak), k: "longest streak (days)" },
    { v: formatBigWords(sum.totalWords), k: "words read" },
  ];
  const gx = 80;
  const gy = 700;
  const gw = (W - 160 - 40) / 2;
  const gh = 140;
  cells.forEach((c, i) => {
    const x = gx + (i % 2) * (gw + 40);
    const y = gy + Math.floor(i / 2) * (gh + 24);
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 2;
    roundRectPath(ctx, x, y, gw, gh, 18);
    ctx.stroke();
    ctx.fillStyle = C.text;
    ctx.font = `800 54px ${sans}`;
    ctx.fillText(c.v, x + 28, y + 68);
    ctx.fillStyle = C.muted;
    ctx.font = `500 24px ${sans}`;
    ctx.fillText(c.k, x + 30, y + 108);
  });

  // Top topic + best day
  ctx.font = `500 28px ${sans}`;
  ctx.fillStyle = C.muted;
  ctx.fillText("Top topic", 80, 1062);
  ctx.fillText("Best day", 580, 1062);
  ctx.fillStyle = C.text;
  ctx.font = `700 34px ${sans}`;
  ctx.fillText(topTopic ? capWords(topTopic.topic) : "—", 80, 1106);
  if (sum.bestDay && sum.bestDay.minutes > 0) {
    const nice = new Date(sum.bestDay.date + "T12:00:00").toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
    });
    ctx.fillText(`${Math.round(sum.bestDay.minutes)} min · ${nice}`, 580, 1106);
  } else {
    ctx.fillText("—", 580, 1106);
  }

  // Mini heatmap: last 26 weeks
  const weeks = 26;
  const cell = 13;
  const gap = 4;
  const gridW = weeks * (cell + gap);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() - (weeks * 7 - 1));
  start.setDate(start.getDate() - start.getDay());
  const ox = (W - gridW) / 2;
  const oy = 1150;
  const todayKey = localDateKey(today);
  for (let w = 0; w < weeks; w++) {
    for (let r = 0; r < 7; r++) {
      const d = new Date(start);
      d.setDate(d.getDate() + w * 7 + r);
      const key = localDateKey(d);
      if (key > todayKey) continue;
      const mins = (days[key] && days[key].minutes) || 0;
      ctx.fillStyle = C.levels[levelFor(mins, settings.dailyGoalMin)];
      roundRectPath(ctx, ox + w * (cell + gap), oy + r * (cell + gap), cell, cell, 3);
      ctx.fill();
    }
  }

  // Footer CTA
  ctx.fillStyle = C.muted;
  ctx.font = `600 26px ${sans}`;
  ctx.textAlign = "center";
  ctx.fillText("Track your own reading streak — free on the Chrome Web Store", W / 2, H - 55);
  ctx.textAlign = "left";
}

function formatBigWords(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return Math.round(n / 1000) + "K";
  return String(n);
}

function capWords(s) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function downloadWrapped(canvas) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reading-wrapped-${localDateKey()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, "image/png");
}
