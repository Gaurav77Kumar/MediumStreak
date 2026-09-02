/* On-page celebration: fires when the background worker reports that the
 * daily reading goal was just crossed in this tab. Exposes window.msCelebrate
 * so the dev harness (tools/celebrate-test.html) can trigger it too.
 */

(() => {
  if (window.__msCelebrateLoaded) return;
  window.__msCelebrateLoaded = true;

  const TOAST_MS = 6000;
  const CONFETTI_MS = 3200;

  function confettiBurst() {
    const canvas = document.createElement("canvas");
    canvas.className = "ms-confetti";
    document.documentElement.appendChild(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext("2d");

    const colors = ["#39d353", "#26a641", "#f5c518", "#ff9f1c", "#58a6ff", "#f85149"];
    const parts = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.3,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      vy: 2 + Math.random() * 3.5,
      vx: -1.5 + Math.random() * 3,
      rot: Math.random() * Math.PI,
      vr: -0.15 + Math.random() * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    const start = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t - start < CONFETTI_MS) requestAnimationFrame(frame);
      else canvas.remove();
    })(start);
  }

  window.msCelebrate = function ({ minutes, streak }) {
    const toast = document.createElement("div");
    toast.className = "ms-toast";

    const title = document.createElement("div");
    title.className = "ms-toast-title";
    title.textContent = "🔥 Streak secured!";

    const sub = document.createElement("div");
    sub.className = "ms-toast-sub";
    sub.textContent = `Daily goal hit — ${minutes} min read today${
      streak > 0 ? ` · ${streak}-day streak` : ""
    }`;

    toast.append(title, sub);
    document.documentElement.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));

    confettiBurst();
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 400);
    }, TOAST_MS);
  };

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "streakSecured") {
        try {
          window.msCelebrate(msg);
        } catch (e) {
          // page may be unloading
        }
      }
    });
  }
})();
