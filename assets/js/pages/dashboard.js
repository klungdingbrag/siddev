import { api } from "../api/endpoints.js";

const DASHBOARD_DEFAULT_YEAR = 2026;
const DASHBOARD_DEFAULT_MONTH = 9;

let dashboardState = {
  year: DASHBOARD_DEFAULT_YEAR,
  month: DASHBOARD_DEFAULT_MONTH,
  loading: false,
  sales: null,
  profit: null,
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
    loadDashboard();
  });

  yearSelect.addEventListener("change", () => {
    dashboardState.year = Number(yearSelect.value);
    loadDashboard();
  });

  document.querySelector("#dashboard-refresh")?.addEventListener("click", loadDashboard);
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
    state.innerHTML = isLoading ? '<span class="dashboard-spinner"></span><span>Memuat data Dashboard...</span>' : "";
  }
}

function renderDashboardData() {
  const sales = dashboardState.sales;
  const profit = dashboardState.profit;
  const piutang = dashboardState.piutang;

  const salesSummary = sales?.summary || {};
  const profitSummary = profit?.summary || {};

  document.querySelector("#dashboard-omzet").textContent = formatCompactRupiah(salesSummary.total_omzet);
  document.querySelector("#dashboard-omzet-meta").textContent =
    `${salesSummary.jumlah_hari_berdata || 0} hari · ${salesSummary.total_transaksi || 0} transaksi`;

  document.querySelector("#dashboard-laba").textContent = formatCompactRupiah(profitSummary.total_laba);
  document.querySelector("#dashboard-laba-meta").textContent =
    `${profitSummary.jumlah_bulan_berdata || 0} bulan pada rentang laporan`;

  document.querySelector("#dashboard-transaksi").textContent =
    new Intl.NumberFormat("id-ID").format(salesSummary.total_transaksi || 0);

  document.querySelector("#dashboard-transaksi-meta").textContent =
    `Bulan ${monthLabel(dashboardState.month)} ${dashboardState.year}`;

  const piutangTotal = extractPiutangTotal(piutang);
  document.querySelector("#dashboard-piutang").textContent =
    piutangTotal === null ? "—" : formatCompactRupiah(piutangTotal);

  if (piutangTotal !== null) {
    document.querySelector("#dashboard-piutang-meta").textContent = "Saldo piutang berjalan";
  }

  document.querySelector("#dashboard-sales-total").textContent =
    formatRupiah(salesSummary.total_omzet);

  document.querySelector("#dashboard-profit-total").textContent =
    formatRupiah(profitSummary.total_laba);

  renderLineChart(document.querySelector("#dashboard-sales-chart"), normalizeSalesRows(sales?.data));
  renderProfitChart(document.querySelector("#dashboard-profit-chart"), normalizeProfitRows(profit?.data));
}

async function loadDashboard() {
  if (dashboardState.loading) return;

  setDashboardLoading(true);
  dashboardState.error = null;

  const selectedRange = monthRange(dashboardState.year, dashboardState.month);
  const profitRange = yearRange(dashboardState.year, dashboardState.month);

  try {
    // Dashboard utama tidak boleh menunggu modul Piutang.
    // Sales + profit adalah sumber grafik Dashboard; Piutang dimuat terpisah
    // agar keterlambatan/masalah endpoint Piutang tidak membuat seluruh Dashboard blank.
    const [salesResult, profitResult] = await Promise.all([
      api.dashboardSalesDaily(selectedRange.start, selectedRange.end),
      api.dashboardProfitMonthly(profitRange.start, profitRange.end)
    ]);

    // apiRequest() sudah mengembalikan result.data.
    // Jangan mengambil .data sekali lagi karena payload Dashboard V1
    // memiliki struktur { summary, data, query_metadata, ... }.
    dashboardState.sales = salesResult;
    dashboardState.profit = profitResult;

    // Render segera setelah dua sumber utama tersedia.
    renderDashboardData();
    setDashboardLoading(false);

    // KPI piutang bersifat tambahan dan tidak memblokir grafik.
    api.piutang()
      .then((piutangResult) => {
        dashboardState.piutang = piutangResult;
        const piutangTotal = extractPiutangTotal(piutangResult);
        const value = document.querySelector("#dashboard-piutang");
        const meta = document.querySelector("#dashboard-piutang-meta");

        if (value && piutangTotal !== null) {
          value.textContent = formatCompactRupiah(piutangTotal);
        }
        if (meta && piutangTotal !== null) {
          meta.textContent = "Saldo piutang berjalan";
        }
      })
      .catch((error) => {
        console.warn("[Dashboard] piutang KPI gagal dimuat:", error);
      });
  } catch (error) {
    dashboardState.error = error;
    const state = document.querySelector("#dashboard-state");
    if (state) {
      state.className = "dashboard-state is-error";
      state.innerHTML = `
        <strong>Dashboard belum dapat dimuat.</strong>
        <span>${escapeHtml(error?.message || String(error))}</span>
        <button class="btn btn-light" id="dashboard-retry" type="button">Coba lagi</button>
      `;
      document.querySelector("#dashboard-retry")?.addEventListener("click", loadDashboard);
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
  loadDashboard();
}
