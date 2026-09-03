
function renderHeatmap(container, days, options = {}) {
  const o = {
    weeks: 53,
    cell: 11,
    gap: 3,
    goalMin: 10,
    showWeekdays: false,
    showMonths: true,
    today: new Date(),
    ...options,
  };

  container.innerHTML = "";
  container.classList.add("hm");
  container.style.setProperty("--cell", o.cell + "px");
  container.style.setProperty("--gap", o.gap + "px");

  const todayKey = localDateKey(o.today);

  // Start on the Sunday on/before the first day of the window.
  const start = addDays(o.today, -(o.weeks * 7 - 1));
  start.setDate(start.getDate() - start.getDay());

  const main = document.createElement("div");
  main.className = "hm-main";

  if (o.showMonths) {
    const months = document.createElement("div");
    months.className = "hm-months";
    months.style.marginLeft = o.showWeekdays ? "calc(26px + var(--gap))" : "0";
    main.appendChild(months);

    let prevMonth = -1;
    for (let w = 0; w < o.weeks; w++) {
      const colDate = addDays(start, w * 7);
      // Label a column when it's the first whose Sunday falls in a new month.
      if (colDate.getMonth() !== prevMonth) {
        if (prevMonth !== -1 && w < o.weeks - 1) {
          const label = document.createElement("span");
          label.textContent = colDate.toLocaleString(undefined, { month: "short" });
          label.style.left = w * (o.cell + o.gap) + "px";
          months.appendChild(label);
        }
        prevMonth = colDate.getMonth();
      }
    }
  }

  const body = document.createElement("div");
  body.className = "hm-body";

  if (o.showWeekdays) {
    const wd = document.createElement("div");
    wd.className = "hm-weekdays";
    for (let r = 0; r < 7; r++) {
      const s = document.createElement("span");
      s.textContent = r === 1 ? "Mon" : r === 3 ? "Wed" : r === 5 ? "Fri" : "";
      wd.appendChild(s);
    }
    body.appendChild(wd);
  }

  const cells = document.createElement("div");
  cells.className = "hm-cells";

  for (let w = 0; w < o.weeks; w++) {
    for (let r = 0; r < 7; r++) {
      const date = addDays(start, w * 7 + r);
      const key = localDateKey(date);
      const cell = document.createElement("div");
      cell.className = "hm-cell";

      if (key > todayKey) {
        cell.classList.add("future");
        cells.appendChild(cell);
        continue;
      }

      const entry = days[key] || {};
      const mins = entry.minutes || 0;
      const level = mins <= 0 ? 0 : mins < o.goalMin / 2 ? 1 : mins < o.goalMin ? 2 : mins < o.goalMin * 2 ? 3 : 4;
      if (level > 0) cell.classList.add("l" + level);
      if (key === todayKey) cell.classList.add("today");

      const nice = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      cell.title = entry.frozen
        ? `${nice} — streak freeze used ❄️`
        : mins > 0
          ? `${Math.round(mins)} min read · ${nice}`
          : `${nice} — no reading`;
      cells.appendChild(cell);
    }
  }

  body.appendChild(cells);
  main.appendChild(body);
  container.appendChild(main);
}
