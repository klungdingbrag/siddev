// Dashboard chart renderers. Data fetching, normalization, state, and caching remain in dashboard.js.

export function renderLineChart(container, rows, helpers) {
  const { escapeHtml, formatCompactRupiah, formatRupiah } = helpers;
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = '<div class="dashboard-chart-empty">Tidak ada data penjualan pada periode ini.</div>';
    return;
  }

  const width = 900;
  const height = 300;
  const pad = { top: 24, right: 24, bottom: 42, left: 70 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(...rows.map((row) => row.total_omzet), 1);
  const min = 0;

  const points = rows.map((row, index) => {
    const x = pad.left + (rows.length === 1 ? plotW / 2 : index * plotW / (rows.length - 1));
    const y = pad.top + plotH - ((row.total_omzet - min) / (max - min)) * plotH;
    return { ...row, x, y };
  });

  const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const area = `${path} L ${points[points.length - 1].x.toFixed(2)} ${pad.top + plotH} L ${points[0].x.toFixed(2)} ${pad.top + plotH} Z`;

  const yTicks = [0, .25, .5, .75, 1].map((ratio) => ({
    y: pad.top + plotH - ratio * plotH,
    value: max * ratio
  }));

  const xLabels = points.filter((_, index) => {
    if (rows.length <= 10) return true;
    if (rows.length <= 20) return index % 2 === 0;
    return index % 5 === 0 || index === rows.length - 1;
  });

  container.innerHTML = `
    <div class="dashboard-chart-stage">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafik omzet harian">
      <defs>
        <linearGradient id="dashboardSalesArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(37,99,235,.24)"></stop>
          <stop offset="100%" stop-color="rgba(37,99,235,0)"></stop>
        </linearGradient>
      </defs>
      ${yTicks.map((tick) => `
        <line x1="${pad.left}" y1="${tick.y}" x2="${width - pad.right}" y2="${tick.y}" class="dashboard-grid-line"></line>
        <text x="${pad.left - 10}" y="${tick.y + 4}" text-anchor="end" class="dashboard-axis-label">${escapeHtml(formatCompactRupiah(tick.value))}</text>
      `).join("")}
      <path d="${area}" class="dashboard-area"></path>
      <path d="${path}" class="dashboard-line"></path>
      ${points.map((point) => `
        <circle cx="${point.x}" cy="${point.y}" r="3.5" class="dashboard-point">
          <title>${escapeHtml(point.tanggal)} · ${escapeHtml(formatRupiah(point.total_omzet))} · ${point.jumlah_transaksi} transaksi</title>
        </circle>
      `).join("")}
      ${xLabels.map((point) => `
        <text x="${point.x}" y="${height - 15}" text-anchor="middle" class="dashboard-axis-label">${escapeHtml(point.label)}</text>
      `).join("")}
    </svg>
  `;
  container.querySelector("svg")?.insertAdjacentHTML("beforeend", `
    <line class="dashboard-crosshair" data-crosshair x1="-10" y1="${pad.top}" x2="-10" y2="${pad.top + plotH}"></line>
    <circle class="dashboard-focus-point" data-focus cx="-10" cy="-10" r="5"></circle>
    <rect class="dashboard-chart-hitarea" data-hitarea x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}"></rect>
  `);
  const stage = container.querySelector(".dashboard-chart-stage");
  const hitarea = container.querySelector("[data-hitarea]");
  const crosshair = container.querySelector("[data-crosshair]");
  const focus = container.querySelector("[data-focus]");
  let tooltip = container.querySelector(".dashboard-chart-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "dashboard-chart-tooltip";
    tooltip.setAttribute("role", "status");
    tooltip.setAttribute("aria-live", "polite");
    stage.appendChild(tooltip);
  }
  const showPoint = (clientX) => {
    if (!hitarea || !stage) return;
    const rect = hitarea.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const index = Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1))));
    const point = points[index];
    crosshair?.setAttribute("x1", point.x);
    crosshair?.setAttribute("x2", point.x);
    focus?.setAttribute("cx", point.x);
    focus?.setAttribute("cy", point.y);
    tooltip.innerHTML = "<strong>" + escapeHtml(point.tanggal) + "</strong><span>" + escapeHtml(formatRupiah(point.total_omzet)) + "</span><small>" + point.jumlah_transaksi + " transaksi</small>";
    tooltip.classList.add("is-visible");
    const stageRect = stage.getBoundingClientRect();
    const left = ((point.x - pad.left) / plotW) * stageRect.width + (pad.left / width) * stageRect.width;
    tooltip.style.left = Math.max(8, Math.min(stageRect.width - tooltip.offsetWidth - 8, left + 8)) + "px";
  };
  hitarea?.addEventListener("pointermove", (event) => showPoint(event.clientX));
  hitarea?.addEventListener("pointerdown", (event) => showPoint(event.clientX));
  hitarea?.addEventListener("pointerleave", () => {
    crosshair?.setAttribute("x1", "-10");
    crosshair?.setAttribute("x2", "-10");
    focus?.setAttribute("cx", "-10");
    focus?.setAttribute("cy", "-10");
    tooltip?.classList.remove("is-visible");
  });
}

export function renderProfitChart(container, rows, helpers) {
  const { escapeHtml, formatCompactRupiah, formatRupiah } = helpers;
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = '<div class="dashboard-chart-empty">Belum ada data laba pada periode ini.</div>';
    return;
  }

  const width = 700;
  const height = 300;
  const pad = { top: 24, right: 20, bottom: 42, left: 70 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(...rows.map((row) => row.total_laba), 1);
  const barGap = 10;
  const barW = Math.max(18, Math.min(44, (plotW / rows.length) - barGap));

  const yTicks = [0, .5, 1].map((ratio) => ({
    y: pad.top + plotH - ratio * plotH,
    value: max * ratio
  }));

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafik laba bulanan">
      ${yTicks.map((tick) => `
        <line x1="${pad.left}" y1="${tick.y}" x2="${width - pad.right}" y2="${tick.y}" class="dashboard-grid-line"></line>
        <text x="${pad.left - 10}" y="${tick.y + 4}" text-anchor="end" class="dashboard-axis-label">${escapeHtml(formatCompactRupiah(tick.value))}</text>
      `).join("")}
      ${rows.map((row, index) => {
        const x = pad.left + index * (plotW / rows.length) + ((plotW / rows.length) - barW) / 2;
        const barH = (row.total_laba / max) * plotH;
        const y = pad.top + plotH - barH;
        return `
          <rect x="${x}" y="${y}" width="${barW}" height="${Math.max(0, barH)}" rx="6" class="dashboard-profit-bar">
            <title>${escapeHtml(row.bulan)} · ${escapeHtml(formatRupiah(row.total_laba))}</title>
          </rect>
          <text x="${x + barW / 2}" y="${height - 15}" text-anchor="middle" class="dashboard-axis-label">${escapeHtml(row.label)}</text>
        `;
      }).join("")}
    </svg>
  `;

  // Interaction layer only: the chart render above remains the source of truth.
  // If this layer fails, the SVG and native <title> tooltip still remain usable.
  try {
    const tooltip = document.createElement("div");
    tooltip.className = "dashboard-profit-tooltip";
    tooltip.setAttribute("role", "status");
    tooltip.setAttribute("aria-live", "polite");
    container.classList.add("dashboard-profit-chart-interactive");
    container.appendChild(tooltip);

    const bars = Array.from(container.querySelectorAll(".dashboard-profit-bar"));
    const hideTooltip = () => {
      tooltip.classList.remove("is-visible");
      tooltip.removeAttribute("data-open");
    };

    const showTooltip = (bar, row) => {
      const containerRect = container.getBoundingClientRect();
      const barRect = bar.getBoundingClientRect();

      tooltip.innerHTML = `
        <strong>${escapeHtml(row.label || row.bulan)}</strong>
        <span>${escapeHtml(formatRupiah(row.total_laba))}</span>
      `;

      tooltip.classList.add("is-visible");
      tooltip.setAttribute("data-open", "true");

      const tooltipWidth = tooltip.offsetWidth;
      const tooltipHeight = tooltip.offsetHeight;
      const barCenter = barRect.left + (barRect.width / 2) - containerRect.left;
      const preferredLeft = barCenter - (tooltipWidth / 2);
      const preferredTop = barRect.top - containerRect.top - tooltipHeight - 8;

      tooltip.style.left = `${Math.max(8, Math.min(containerRect.width - tooltipWidth - 8, preferredLeft))}px`;
      tooltip.style.top = `${Math.max(8, preferredTop)}px`;
    };

    bars.forEach((bar, index) => {
      const row = rows[index];
      if (!row) return;

      bar.addEventListener("mouseenter", () => showTooltip(bar, row));
      bar.addEventListener("mouseleave", hideTooltip);
      bar.addEventListener("click", () => {
        if (tooltip.getAttribute("data-open") === "true") {
          hideTooltip();
        } else {
          showTooltip(bar, row);
        }
      });
    });
  } catch (error) {
    console.warn("[Dashboard] Laba Bulanan interaction layer gagal:", error);
  }
}


export function renderProfitDailyChart(container, rows, salesRows, monthlyTotal, helpers) {
  const { escapeHtml, formatCompactRupiah, formatRupiah, setDashboardText } = helpers;
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = '<div class="dashboard-chart-empty">Belum ada data laba harian pada periode ini.</div>';
    setDashboardText("#dashboard-profit-daily-total", formatRupiah(0));
    setDashboardText("#dashboard-profit-reconciliation", "");
    return;
  }

  const salesByDate = new Map((Array.isArray(salesRows) ? salesRows : []).map((row) => [row.tanggal, row]));
  const width = 700;
  const height = 300;
  const pad = { top: 24, right: 20, bottom: 42, left: 70 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(...rows.map((row) => row.total_laba), 1);
  const min = Math.min(0, ...rows.map((row) => row.total_laba));
  const range = Math.max(max - min, 1);

  const points = rows.map((row, index) => {
    const x = pad.left + (rows.length === 1 ? plotW / 2 : index * plotW / (rows.length - 1));
    const y = pad.top + plotH - ((row.total_laba - min) / range) * plotH;
    return { ...row, x, y };
  });

  const path = points.map((point, index) => (index ? "L" : "M") + " " + point.x.toFixed(2) + " " + point.y.toFixed(2)).join(" ");
  const yTicks = [0, .25, .5, .75, 1].map((ratio) => ({
    y: pad.top + plotH - ratio * plotH,
    value: min + ratio * (max - min)
  }));

  const xLabels = points.filter((_, index) => {
    if (rows.length <= 10) return true;
    if (rows.length <= 20) return index % 2 === 0;
    return index % 5 === 0 || index === rows.length - 1;
  });

  container.innerHTML = `
    <div class="dashboard-chart-stage">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafik laba harian">
        ${yTicks.map((tick) => `
          <line x1="${pad.left}" y1="${tick.y}" x2="${width - pad.right}" y2="${tick.y}" class="dashboard-grid-line"></line>
          <text x="${pad.left - 10}" y="${tick.y + 4}" text-anchor="end" class="dashboard-axis-label">${escapeHtml(formatCompactRupiah(tick.value))}</text>
        `).join("")}
        <path d="${path}" class="dashboard-profit-daily-line"></path>
        ${points.map((point) => `
          <circle cx="${point.x}" cy="${point.y}" r="3.5" class="dashboard-profit-daily-point"></circle>
        `).join("")}
        ${xLabels.map((point) => `
          <text x="${point.x}" y="${height - 15}" text-anchor="middle" class="dashboard-axis-label">${escapeHtml(point.tanggal.slice(8, 10) + "/" + point.tanggal.slice(5, 7))}</text>
        `).join("")}
      </svg>
    </div>
  `;

  const stage = container.querySelector(".dashboard-chart-stage");
  const svg = container.querySelector("svg");
  if (!stage || !svg) return;

  svg.insertAdjacentHTML("beforeend", `
    <line class="dashboard-crosshair dashboard-profit-daily-crosshair" data-profit-daily-crosshair x1="-10" y1="${pad.top}" x2="-10" y2="${pad.top + plotH}"></line>
    <circle class="dashboard-focus-point dashboard-profit-daily-focus" data-profit-daily-focus cx="-10" cy="-10" r="5"></circle>
    <rect class="dashboard-chart-hitarea" data-profit-daily-hitarea x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}"></rect>
  `);

  const tooltip = document.createElement("div");
  tooltip.className = "dashboard-chart-tooltip dashboard-profit-daily-tooltip";
  tooltip.setAttribute("role", "status");
  tooltip.setAttribute("aria-live", "polite");
  stage.appendChild(tooltip);

  const hitarea = stage.querySelector("[data-profit-daily-hitarea]");
  const crosshair = stage.querySelector("[data-profit-daily-crosshair]");
  const focus = stage.querySelector("[data-profit-daily-focus]");

  const showPoint = (clientX) => {
    const rect = hitarea.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const index = Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1))));
    const point = points[index];
    const sales = salesByDate.get(point.tanggal);

    crosshair.setAttribute("x1", point.x);
    crosshair.setAttribute("x2", point.x);
    focus.setAttribute("cx", point.x);
    focus.setAttribute("cy", point.y);

    tooltip.innerHTML =
      "<strong>" + escapeHtml(point.tanggal) + "</strong>" +
      "<span>" + escapeHtml(formatRupiah(point.total_laba)) + "</span>" +
      "<small>Laba</small>" +
      (sales
        ? "<small>Omzet " + escapeHtml(formatCompactRupiah(sales.total_omzet)) + "</small>" +
          "<small>" + sales.jumlah_transaksi + " transaksi</small>"
        : "");

    tooltip.classList.add("is-visible");
    const stageRect = stage.getBoundingClientRect();
    const left = ((point.x - pad.left) / plotW) * stageRect.width + (pad.left / width) * stageRect.width;
    tooltip.style.left = Math.max(8, Math.min(stageRect.width - tooltip.offsetWidth - 8, left + 8)) + "px";
  };

  const hidePoint = () => {
    crosshair.setAttribute("x1", "-10");
    crosshair.setAttribute("x2", "-10");
    focus.setAttribute("cx", "-10");
    focus.setAttribute("cy", "-10");
    tooltip.classList.remove("is-visible");
  };

  hitarea.addEventListener("pointermove", (event) => showPoint(event.clientX));
  hitarea.addEventListener("pointerdown", (event) => showPoint(event.clientX));
  hitarea.addEventListener("pointerleave", hidePoint);

  const dailyTotal = rows.reduce((sum, row) => sum + row.total_laba, 0);
  setDashboardText("#dashboard-profit-daily-total", formatRupiah(dailyTotal));

  const monthlyValue = Number(monthlyTotal || 0);
  const difference = dailyTotal - monthlyValue;
  const tolerance = 0.01;
  const reconciliation = document.querySelector("#dashboard-profit-reconciliation");

  if (reconciliation) {
    reconciliation.className = "dashboard-reconciliation " + (Math.abs(difference) <= tolerance ? "is-ok" : "is-warning");
    reconciliation.innerHTML = Math.abs(difference) <= tolerance
      ? "<span>✓ Rekonsiliasi</span><strong>Sesuai dengan laba bulanan</strong>"
      : "<span>⚠ Rekonsiliasi</span><strong>Selisih " + escapeHtml(formatRupiah(difference)) + "</strong>";
  }
}

