import { api } from "../api/endpoints.js";

const DASHBOARD_NOW = new Date();
const DASHBOARD_DEFAULT_YEAR = DASHBOARD_NOW.getFullYear();
const DASHBOARD_DEFAULT_MONTH = DASHBOARD_NOW.getMonth() + 1;
const DASHBOARD_CACHE_KEY = "sidretail:dashboard:v1";
const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;

let dashboardState = {
  year: DASHBOARD_DEFAULT_YEAR,
  month: DASHBOARD_DEFAULT_MONTH,
  loading: false,
  sales: null,
  profit: null,
  profitDaily: null,
  piutang: null,
  error: null
};

function pad2(value) {
  return String(value).padStart(2, "0");
}

function monthRange(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(lastDay)}`
  };
}

function yearRange(year, month) {
  return {
    start: `${year}-01-01`,
    end: `${year}-${pad2(month)}-${pad2(new Date(year, month, 0).getDate())}`
  };
}

function formatRupiah(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(number);
}

function formatCompactRupiah(value) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000000000) {
    return `Rp ${(number / 1000000000).toFixed(2).replace(".", ",")} M`;
  }
  if (Math.abs(number) >= 1000000) {
    return `Rp ${(number / 1000000).toFixed(2).replace(".", ",")} jt`;
  }
  if (Math.abs(number) >= 1000) {
    return `Rp ${(number / 1000).toFixed(0)} rb`;
  }
  return formatRupiah(number);
}

function dashboardCacheKey() {
  return DASHBOARD_CACHE_KEY + ":" + dashboardState.year + "-" + pad2(dashboardState.month);
}

function readDashboardCache() {
  try {
    const raw = sessionStorage.getItem(dashboardCacheKey());
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached?.savedAt || !cached?.state) return null;
    return { state: cached.state, ageMs: Date.now() - Number(cached.savedAt) };
  } catch (error) {
    console.warn("[Dashboard] cache read gagal:", error);
    return null;
  }
}

function writeDashboardCache() {
  try {
    sessionStorage.setItem(dashboardCacheKey(), JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      state: {
        year: dashboardState.year,
        month: dashboardState.month,
        sales: dashboardState.sales,
        profit: dashboardState.profit,
        profitDaily: dashboardState.profitDaily,
        piutang: dashboardState.piutang
      }
    }));
  } catch (error) {
    console.warn("[Dashboard] cache write gagal:", error);
  }
}

function restoreDashboardCache(cached) {
  if (!cached?.state) return false;
  dashboardState.sales = cached.state.sales || null;
  dashboardState.profit = cached.state.profit || null;
  dashboardState.profitDaily = cached.state.profitDaily || null;
  dashboardState.piutang = cached.state.piutang || null;
  renderDashboardData();
  return true;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function monthLabel(month) {
  return new Intl.DateTimeFormat("id-ID", { month: "long" })
    .format(new Date(2020, month - 1, 1));
}

function normalizeSalesRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const raw = String(row.tanggal || "");
    let label = raw;
    let date = null;

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
      const [day, month, year] = raw.split("/");
      date = new Date(Number(year), Number(month) - 1, Number(day));
      label = `${day}/${month}`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [year, month, day] = raw.split("-");
      date = new Date(Number(year), Number(month) - 1, Number(day));
      label = `${day}/${month}`;
    }

    return {
      tanggal: raw,
      label,
      date,
      total_omzet: Number(row.total_omzet || 0),
      jumlah_transaksi: Number(row.jumlah_transaksi || 0)
    };
  });
}

function normalizeProfitRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const raw = String(row.bulan || "");
    const [year, month] = raw.split("-");
    return {
      bulan: raw,
      label: year && month ? monthLabel(Number(month)).slice(0, 3) : raw,
      total_laba: Number(row.total_laba || 0)
    };
  });
}

function extractPiutangTotal(result) {
  const data = result;
  if (!data) return null;

  const candidates = [
    data.total_piutang,
    data.summary?.total_piutang,
    data.totalOutstanding,
    data.total_outstanding
  ];

  for (const value of candidates) {
    if (value !== undefined && value !== null && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }

  return null;
}

function buildDashboardShell() {
  return `
    <section class="dashboard-page">
      <div class="page-heading dashboard-heading">
        <div>
          <p class="eyebrow">TB Nusantara · SID Retail Pro</p>
          <h2>Dashboard</h2>
          <p class="page-description">Ringkasan aktivitas penjualan dan laba berdasarkan data SID Retail.</p>
        </div>
        <div class="dashboard-toolbar">
          <label class="dashboard-period">
            <span>Bulan</span>
            <select id="dashboard-month" aria-label="Pilih bulan"></select>
          </label>
          <label class="dashboard-period">
            <span>Tahun</span>
            <select id="dashboard-year" aria-label="Pilih tahun"></select>
          </label>
          <button class="btn btn-primary" id="dashboard-refresh" type="button">Refresh</button>
        </div>
      </div>

      <div id="dashboard-state" class="dashboard-state"></div>

      <section class="dashboard-kpis" id="dashboard-kpis">
        <article class="dashboard-kpi dashboard-kpi-primary">
          <div class="dashboard-kpi-icon">Rp</div>
          <div>
            <span>Omzet Penjualan</span>
            <strong id="dashboard-omzet">—</strong>
            <small id="dashboard-omzet-meta">Memuat data...</small>
          </div>
        </article>
        <article class="dashboard-kpi dashboard-kpi-profit">
          <div class="dashboard-kpi-icon">↗</div>
          <div>
            <span>Laba Bulanan</span>
            <strong id="dashboard-laba">—</strong>
            <small id="dashboard-laba-meta">Memuat data...</small>
          </div>
        </article>
        <article class="dashboard-kpi">
          <div class="dashboard-kpi-icon">#</div>
          <div>
            <span>Transaksi</span>
            <strong id="dashboard-transaksi">—</strong>
            <small id="dashboard-transaksi-meta">Periode terpilih</small>
          </div>
        </article>
        <article class="dashboard-kpi">
          <div class="dashboard-kpi-icon">Pi</div>
          <div>
            <span>Piutang Berjalan</span>
            <strong id="dashboard-piutang">—</strong>
            <small id="dashboard-piutang-meta">Menggunakan data Piutang V1</small>
          </div>
        </article>
      </section>

      <section class="dashboard-chart-grid">
        <article class="dashboard-panel dashboard-chart-panel dashboard-chart-wide">
          <div class="dashboard-panel-head">
            <div>
              <span class="dashboard-panel-eyebrow">Aktivitas Penjualan</span>
              <h3>Omzet Harian</h3>
            </div>
            <div class="dashboard-panel-value" id="dashboard-sales-total">—</div>
          </div>
          <div class="dashboard-chart-wrap">
            <div id="dashboard-sales-chart" class="dashboard-chart" aria-label="Grafik omzet harian"></div>
          </div>
        </article>

        <article class="dashboard-panel dashboard-calendar-panel">
          <div id="dashboard-calendar" class="dashboard-calendar" aria-label="Kalender operasional"></div>
        </article>

        <article class="dashboard-panel dashboard-chart-panel">
          <div class="dashboard-panel-head">
            <div>
              <span class="dashboard-panel-eyebrow">Performa Keuangan</span>
              <h3>Laba Bulanan</h3>
            </div>
            <div class="dashboard-panel-value" id="dashboard-profit-total">—</div>
          </div>
          <div class="dashboard-chart-wrap dashboard-chart-wrap-profit">
            <div id="dashboard-profit-chart" class="dashboard-chart" aria-label="Grafik laba bulanan"></div>
          </div>
        </article>

        <article class="dashboard-panel dashboard-chart-panel dashboard-chart-daily-profit">
          <div class="dashboard-panel-head">
            <div>
              <span class="dashboard-panel-eyebrow">Performa Keuangan</span>
              <h3>Laba Harian</h3>
            </div>
            <div class="dashboard-panel-value" id="dashboard-profit-daily-total">—</div>
          </div>
          <div class="dashboard-chart-wrap dashboard-chart-wrap-profit-daily">
            <div id="dashboard-profit-daily-chart" class="dashboard-chart" aria-label="Grafik laba harian"></div>
          </div>
          <div class="dashboard-reconciliation" id="dashboard-profit-reconciliation" aria-live="polite"></div>
        </article>

        <article class="dashboard-panel dashboard-definition">
          <div class="dashboard-panel-head">
            <div>
              <span class="dashboard-panel-eyebrow">Definisi Data</span>
              <h3>Source of truth</h3>
            </div>
          </div>
          <div class="dashboard-definition-list">
            <div><span>Omzet harian</span><strong>penjualan.jumlah</strong></div>
            <div><span>Laba bulanan</span><strong>SUM(labarugi.labarugi)</strong></div>
            <div><span>Piutang</span><strong>Data Piutang SID Retail</strong></div>
          </div>
        </article>
      </section>
    </section>
  `;
}

function renderDashboardCalendar(rows) {
  const container = document.querySelector("#dashboard-calendar");
  if (!container) return;

  const year = dashboardState.year;
  const month = dashboardState.month;
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7;
  const salesByDay = new Map(
    (Array.isArray(rows) ? rows : []).map((row) => {
      const date = row.date instanceof Date && !Number.isNaN(row.date.getTime())
        ? `${row.date.getFullYear()}-${pad2(row.date.getMonth() + 1)}-${pad2(row.date.getDate())}`
        : row.tanggal;
      return [date, row];
    })
  );

  const today = new Date();
  const todayKey = today.getFullYear() === year && today.getMonth() + 1 === month
    ? `${year}-${pad2(month)}-${pad2(today.getDate())}`
    : "";

  const cells = [];
  for (let index = 0; index < startOffset; index += 1) {
    cells.push('<div class="dashboard-calendar-day is-empty" aria-hidden="true"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${pad2(month)}-${pad2(day)}`;
    const row = salesByDay.get(key) || salesByDay.get(`${day}/${pad2(month)}`);
    const hasData = Boolean(row);
    const isToday = key === todayKey;
    cells.push(`
      <button
        class="dashboard-calendar-day${hasData ? " has-data" : ""}${isToday ? " is-today" : ""}"
        type="button"
        data-calendar-date="${escapeHtml(key)}"
        aria-label="${escapeHtml(`${day} ${monthLabel(month)} ${year}`)}"
      >
        <span class="dashboard-calendar-number">${day}</span>
        ${hasData ? '<span class="dashboard-calendar-dot"></span>' : ""}
      </button>
    `);
  }

  container.innerHTML = `
    <div class="dashboard-calendar-head">
      <div>
        <span class="dashboard-panel-eyebrow">Kalender Operasional</span>
        <h3>${escapeHtml(monthLabel(month))} ${year}</h3>
      </div>
      <div class="dashboard-calendar-legend">
        <span><i></i> Ada transaksi</span>
      </div>
    </div>
    <div class="dashboard-calendar-weekdays">
      ${["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day) => `<span>${day}</span>`).join("")}
    </div>
    <div class="dashboard-calendar-grid">
      ${cells.join("")}
    </div>
    <div class="dashboard-calendar-detail" id="dashboard-calendar-detail">
      <span>Pilih tanggal</span>
      <strong>Lihat omzet dan transaksi harian</strong>
    </div>
  `;

  container.querySelectorAll("[data-calendar-date]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.calendarDate;
      const row = salesByDay.get(key);
      container.querySelectorAll(".dashboard-calendar-day.is-selected").forEach((item) => {
        item.classList.remove("is-selected");
      });
      button.classList.add("is-selected");

      const detail = container.querySelector("#dashboard-calendar-detail");
      if (!detail) return;

      const day = Number(key.slice(-2));
      detail.innerHTML = row
        ? `<span>${escapeHtml(day + " " + monthLabel(month) + " " + year)}</span><strong>${escapeHtml(formatRupiah(row.total_omzet))}</strong><small>${row.jumlah_transaksi} transaksi</small>`
        : `<span>${escapeHtml(day + " " + monthLabel(month) + " " + year)}</span><strong>Tidak ada transaksi tercatat</strong><small>Belum ada data omzet pada tanggal ini.</small>`;
    });
  });
}

function renderLineChart(container, rows) {
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

function renderProfitChart(container, rows) {
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
}


function normalizeProfitDailyRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    tanggal: String(row.tanggal || ""),
    total_laba: Number(row.total_laba || 0)
  }));
}

function renderProfitDailyChart(container, rows, salesRows, monthlyTotal) {
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
    value: max - ratio * (max - min)
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

function populatePeriodControls() {
  const monthSelect = document.querySelector("#dashboard-month");
  const yearSelect = document.querySelector("#dashboard-year");
  if (!monthSelect || !yearSelect) return;

  monthSelect.innerHTML = Array.from({ length: 12 }, (_, index) =>
    `<option value="${index + 1}" ${index + 1 === dashboardState.month ? "selected" : ""}>${monthLabel(index + 1)}</option>`
  ).join("");

  const years = [];
  for (let year = DASHBOARD_DEFAULT_YEAR - 2; year <= DASHBOARD_DEFAULT_YEAR + 1; year += 1) {
    years.push(year);
  }

  yearSelect.innerHTML = years.map((year) =>
    `<option value="${year}" ${year === dashboardState.year ? "selected" : ""}>${year}</option>`
  ).join("");

  monthSelect.addEventListener("change", () => {
    dashboardState.month = Number(monthSelect.value);
    loadDashboard({ force: true });
  });

  yearSelect.addEventListener("change", () => {
    dashboardState.year = Number(yearSelect.value);
    loadDashboard();
  });

  document.querySelector("#dashboard-refresh")?.addEventListener("click", () => loadDashboard({ force: true }));
}

function setDashboardLoading(isLoading) {
  dashboardState.loading = isLoading;
  const refresh = document.querySelector("#dashboard-refresh");
  if (refresh) {
    refresh.disabled = isLoading;
    refresh.textContent = isLoading ? "Memuat..." : "Refresh";
  }

  const state = document.querySelector("#dashboard-state");
  if (state) {
    state.className = `dashboard-state ${isLoading ? "is-loading" : ""}`;
    state.innerHTML = isLoading ? '<span class="dashboard-spinner"></span><span>Memuat data dashboard...</span>' : "";
  }
}

function dashboardIsMounted() {
  return Boolean(document.querySelector("#dashboard-sales-chart"));
}

function setDashboardText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function renderDashboardData() {
  if (!dashboardIsMounted()) return;

  const sales = dashboardState.sales;
  const profit = dashboardState.profit;
  const piutang = dashboardState.piutang;
  const profitDaily = dashboardState.profitDaily;

  const salesSummary = sales?.summary || {};
  const profitSummary = profit?.summary || {};

  setDashboardText("#dashboard-omzet", formatCompactRupiah(salesSummary.total_omzet));
  setDashboardText(
    "#dashboard-omzet-meta",
    `${salesSummary.jumlah_hari_berdata || 0} hari · ${salesSummary.total_transaksi || 0} transaksi`
  );

  setDashboardText("#dashboard-laba", formatCompactRupiah(profitSummary.total_laba));
  setDashboardText(
    "#dashboard-laba-meta",
    `${profitSummary.jumlah_bulan_berdata || 0} bulan pada rentang laporan`
  );

  setDashboardText(
    "#dashboard-transaksi",
    new Intl.NumberFormat("id-ID").format(salesSummary.total_transaksi || 0)
  );

  setDashboardText(
    "#dashboard-transaksi-meta",
    `Bulan ${monthLabel(dashboardState.month)} ${dashboardState.year}`
  );

  const piutangTotal = extractPiutangTotal(piutang);
  setDashboardText(
    "#dashboard-piutang",
    piutangTotal === null ? "—" : formatCompactRupiah(piutangTotal)
  );

  if (piutangTotal !== null) {
    setDashboardText("#dashboard-piutang-meta", "Saldo piutang berjalan");
  }

  setDashboardText("#dashboard-sales-total", formatRupiah(salesSummary.total_omzet));
  setDashboardText("#dashboard-profit-total", formatRupiah(profitSummary.total_laba));

  const normalizedSalesRows = normalizeSalesRows(sales?.data);

  renderLineChart(
    document.querySelector("#dashboard-sales-chart"),
    normalizedSalesRows
  );
  renderDashboardCalendar(normalizedSalesRows);
  const profitRows = normalizeProfitRows(profit?.data);
  renderProfitChart(
    document.querySelector("#dashboard-profit-chart"),
    profitRows
  );

  const selectedMonthKey = dashboardState.year + "-" + pad2(dashboardState.month);
  const selectedMonthProfit = profitRows.find((row) => row.bulan === selectedMonthKey)?.total_laba || 0;

  renderProfitDailyChart(
    document.querySelector("#dashboard-profit-daily-chart"),
    normalizeProfitDailyRows(profitDaily?.data),
    normalizedSalesRows,
    selectedMonthProfit
  );
}

async function loadDashboard({ force = false } = {}) {
  if (dashboardState.loading) return;

  if (!force) {
    const cache = readDashboardCache();
    if (cache && cache.ageMs < DASHBOARD_CACHE_TTL_MS) {
      restoreDashboardCache(cache);
      setDashboardLoading(false);
      return;
    }
  }

  if (!dashboardIsMounted()) return;
  setDashboardLoading(true);
  dashboardState.error = null;

  const selectedRange = monthRange(dashboardState.year, dashboardState.month);
  const profitRange = yearRange(dashboardState.year, dashboardState.month);

  try {
    const [salesResult, profitResult, profitDailyResult] = await Promise.all([
      api.dashboardSalesDaily(selectedRange.start, selectedRange.end),
      api.dashboardProfitMonthly(profitRange.start, profitRange.end),
      api.dashboardProfitDaily(selectedRange.start, selectedRange.end)
    ]);

    dashboardState.sales = salesResult;
    dashboardState.profit = profitResult;
    dashboardState.profitDaily = profitDailyResult;

    if (!dashboardIsMounted()) return;

    renderDashboardData();
    writeDashboardCache();
    setDashboardLoading(false);

    const cachedPiutang = dashboardState.piutang;
    if (cachedPiutang) return;

    api.piutang()
      .then((piutangResult) => {
        dashboardState.piutang = piutangResult;
        writeDashboardCache();
        if (!dashboardIsMounted()) return;
        const piutangTotal = extractPiutangTotal(piutangResult);
        const value = document.querySelector("#dashboard-piutang");
        const meta = document.querySelector("#dashboard-piutang-meta");
        if (value && piutangTotal !== null) value.textContent = formatCompactRupiah(piutangTotal);
        if (meta && piutangTotal !== null) meta.textContent = "Saldo piutang berjalan";
      })
      .catch((error) => console.warn("[Dashboard] piutang KPI gagal dimuat:", error));
  } catch (error) {
    dashboardState.error = error;
    if (!dashboardIsMounted()) return;
    const state = document.querySelector("#dashboard-state");
    if (state) {
      state.className = "dashboard-state is-error";
      state.innerHTML = `
        <strong>Dashboard belum dapat dimuat.</strong>
        <span>${escapeHtml(error?.message || String(error))}</span>
        <button class="btn btn-light" id="dashboard-retry" type="button">Coba lagi</button>
      `;
      document.querySelector("#dashboard-retry")?.addEventListener("click", () => loadDashboard({ force: true }));
    }
  } finally {
    setDashboardLoading(false);
  }
}

export function renderDashboardPage() {
  const root = document.querySelector("#page-content");
  if (!root) return;

  root.innerHTML = buildDashboardShell();
  populatePeriodControls();
  const cache = readDashboardCache();
  if (cache) {
    restoreDashboardCache(cache);
    if (cache.ageMs >= DASHBOARD_CACHE_TTL_MS) {
      loadDashboard({ force: true });
    }
  } else {
    loadDashboard();
  }
}
