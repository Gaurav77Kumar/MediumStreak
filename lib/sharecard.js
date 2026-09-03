/* Share card: draws a 1200x630 social-ready image of the streak (canvas 2D).
drawShareCard(canvas, { days, settings, stats }) and downloadShareCard(...).
*/

const SHARE_COLORS = {
  bg0: "#0d1117",
  bg1: "#0f1f14",
  border: "#30363d",
  muted: "#7d8590",
  text: "#e6edf3",
  accent: "#39d353",
  empty: "#1c2230",
  levels: ["#1c2230", "#0e4429", "#006d32", "#26a641", "#39d353"],
};

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function levelFor(minutes, goalMin) {
  if (minutes <= 0) return 0;
  if (minutes < goalMin / 2) return 1;
  if (minutes < goalMin) return 2;
  if (minutes < goalMin * 2) return 3;
  return 4;
}

function drawShareCard(canvas, { days, settings, stats, today = new Date() }) {
  const W = 1200;
  const H = 630;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const C = SHARE_COLORS;

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, C.bg0);
  grad.addColorStop(1, C.bg1);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2;
  roundRectPath(ctx, 24, 24, W - 48, H - 48, 24);
  ctx.stroke();

  const sans = `-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

  // Brand
  ctx.fillStyle = C.muted;
  ctx.font = `700 26px ${sans}`;
  ctx.fillText("🔥 MEDIUMSTREAK", 80, 108);

  // Big streak number
  ctx.fillStyle = C.accent;
  ctx.font = `800 200px ${sans}`;
  ctx.fillText(String(stats.currentStreak), 74, 330);

  ctx.fillStyle = C.text;
  ctx.font = `800 40px ${sans}`;
  ctx.fillText("DAY STREAK", 82, 388);

  // Sub-stats
  const hours = Math.round(stats.totalMinutes / 60);
  ctx.fillStyle = C.muted;
  ctx.font = `500 28px ${sans}`;
  ctx.fillText(
    `${stats.totalArticles} articles read   ·   ${hours} hour${hours === 1 ? "" : "s"}   ·   ${stats.totalActiveDays} active days`,
    80,
    470
  );

  ctx.font = `500 24px ${sans}`;
  ctx.fillText("Read with me on Medium — keep the fire going 🔥", 80, 540);

  // Call-to-action footer — this card is the extension's growth loop.
  ctx.fillStyle = C.muted;
  ctx.font = `600 22px ${sans}`;
  ctx.textAlign = "center";
  ctx.fillText("🔥 mediumstreak — track your reading streak · free on the Chrome Web Store", W / 2, 592);
  ctx.textAlign = "left";

  // Heatmap: last 18 weeks, bottom-right.
  const weeks = 18;
  const cell = 16;
  const gap = 5;
  const gridW = weeks * (cell + gap);
  const gridH = 7 * (cell + gap);
  const ox = W - 80 - gridW;
  const oy = H - 80 - gridH;

  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() - (weeks * 7 - 1));
  start.setDate(start.getDate() - start.getDay());
  const todayKey = localDateKey(today);

  for (let w = 0; w < weeks; w++) {
    for (let r = 0; r < 7; r++) {
      const d = new Date(start);
      d.setDate(d.getDate() + w * 7 + r);
      const key = localDateKey(d);
      if (key > todayKey) continue;
      const mins = (days[key] && days[key].minutes) || 0;
      ctx.fillStyle = C.levels[levelFor(mins, settings.dailyGoalMin)];
      roundRectPath(ctx, ox + w * (cell + gap), oy + r * (cell + gap), cell, cell, 4);
      ctx.fill();
    }
  }
}

function downloadShareCard(canvas) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mediumstreak-${localDateKey()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, "image/png");
}
