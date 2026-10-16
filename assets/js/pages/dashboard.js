import { renderLineChart, renderProfitChart, renderProfitDailyChart } from "./dashboard/charts.js?v=20261016-charts-v1";
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
          <button class="btn btn-primary dashboard-refresh" id="dashboard-refresh" type="button">
            <span class="dashboard-refresh-content">Refresh</span>
          </button>
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

function normalizeProfitDailyRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    tanggal: String(row.tanggal || ""),
    total_laba: Number(row.total_laba || 0)
  }));
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
    refresh.setAttribute("aria-busy", isLoading ? "true" : "false");
    refresh.innerHTML = isLoading
      ? '<span class="dashboard-refresh-content"><span class="dashboard-refresh-spinner" aria-hidden="true"></span><span>Memuat…</span></span>'
      : '<span class="dashboard-refresh-content">Refresh</span>';
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

const dashboardChartHelpers = { escapeHtml, formatCompactRupiah, formatRupiah, setDashboardText };

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
    normalizedSalesRows,
    dashboardChartHelpers
  );
  renderDashboardCalendar(normalizedSalesRows);
  const profitRows = normalizeProfitRows(profit?.data);
  renderProfitChart(
    document.querySelector("#dashboard-profit-chart"),
    profitRows,
    dashboardChartHelpers
  );

  const selectedMonthKey = dashboardState.year + "-" + pad2(dashboardState.month);
  const selectedMonthProfit = profitRows.find((row) => row.bulan === selectedMonthKey)?.total_laba || 0;

  renderProfitDailyChart(
    document.querySelector("#dashboard-profit-daily-chart"),
    normalizeProfitDailyRows(profitDaily?.data),
    normalizedSalesRows,
    selectedMonthProfit,
    dashboardChartHelpers
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
