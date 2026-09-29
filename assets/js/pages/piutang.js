import { api } from "../api/endpoints.js";

const state = {
  loaded: false,
  loading: false,
  rows: [],
  filtered: [],
  page: 1,
  pageSize: 25,
  search: ""
};

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(v) {
  return rupiah.format(money(v));
}

function esc(v) {
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

const root = () => document.querySelector("#page-content");

export function renderPiutangPage() {
  root().innerHTML =
    '<section class="page-heading"><div><p class="eyebrow">Laporan</p><h2>Piutang Pelanggan</h2><p class="page-description">Aging piutang berdasarkan transaksi outstanding dari Development backend.</p></div><button id="piutang-refresh" class="btn btn-primary">↻ Refresh</button></section>' +
    '<section class="summary-grid">' +
      '<article class="summary-card"><span>Total Pelanggan</span><strong id="sum-customers">—</strong><small>pelanggan memiliki piutang</small></article>' +
      '<article class="summary-card"><span>Total Piutang</span><strong id="sum-total">—</strong><small>saldo outstanding</small></article>' +
      '<article class="summary-card"><span>Belum Jatuh Tempo</span><strong id="sum-current">—</strong><small>belum melewati jatuh tempo</small></article>' +
      '<article class="summary-card"><span>Jatuh Tempo</span><strong id="sum-overdue">—</strong><small>seluruh aging overdue</small></article>' +
    '</section>' +
    '<section class="card panel"><div class="toolbar"><div class="search-box"><span>⌕</span><input id="piutang-search" type="search" placeholder="Cari kode atau nama pelanggan..." autocomplete="off"></div><label class="page-size"><span>Baris</span><select id="piutang-page-size"><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label></div>' +
    '<div id="piutang-state" class="table-state loading">Memuat data...</div>' +
    '<div id="piutang-table-wrap" class="table-scroll hidden"><table class="data-table"><thead><tr><th>Pelanggan</th><th>Belum Jatuh Tempo</th><th>1–30</th><th>31–60</th><th>61–90</th><th>91–120</th><th>≥121</th><th>Total Piutang</th><th></th></tr></thead><tbody id="piutang-body"></tbody></table></div>' +
    '<div id="piutang-cards" class="mobile-data-cards hidden"></div>' +
    '<div id="piutang-pagination" class="pagination hidden"><button id="piutang-prev" class="btn btn-light">← Sebelumnya</button><span id="piutang-page-info">Halaman 1 / 1</span><button id="piutang-next" class="btn btn-light">Berikutnya →</button></div></section>' +
    '<div id="piutang-modal" class="modal hidden" aria-hidden="true"><div class="modal-backdrop" data-close-detail></div><section class="modal-panel" role="dialog" aria-modal="true"><div class="modal-header"><div><p class="eyebrow">Pelanggan</p><h3 id="detail-title">Detail Piutang</h3><span id="detail-code" class="modal-code"></span></div><button id="detail-close" class="modal-close">×</button></div><div id="detail-content" class="modal-body"></div></section></div>';

  bindEvents();
  loadPiutang();
}

function bindEvents() {
  document.querySelector("#piutang-refresh").addEventListener("click", () => loadPiutang(true));
  document.querySelector("#piutang-search").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    state.page = 1;
    filterAndRender();
  });
  document.querySelector("#piutang-page-size").addEventListener("change", (e) => {
    state.pageSize = Number(e.target.value);
    state.page = 1;
    renderTable();
  });
  document.querySelector("#piutang-prev").addEventListener("click", () => {
    if (state.page > 1) { state.page--; renderTable(); }
  });
  document.querySelector("#piutang-next").addEventListener("click", () => {
    const pages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    if (state.page < pages) { state.page++; renderTable(); }
  });
  document.querySelector("#piutang-body").addEventListener("click", detailClick);
  document.querySelector("#piutang-cards").addEventListener("click", detailClick);
  document.querySelector("#detail-close").addEventListener("click", closeDetail);
  document.querySelector("#piutang-modal").addEventListener("click", (e) => {
    if (e.target.matches("[data-close-detail]")) closeDetail();
  });
}

async function loadPiutang(force = false) {
  if (state.loading || (state.loaded && !force)) return;
  state.loading = true;
  setState("loading", "Mengambil data piutang dari Development backend...");
  try {
    const result = await api.piutang();
    state.rows = Array.isArray(result?.data) ? result.data.filter(r => money(r.total_piutang) > 0) : [];
    state.loaded = true;
    state.page = 1;
    updateSummary(result);
    filterAndRender();
  } catch (error) {
    state.loaded = false;
    state.rows = [];
    state.filtered = [];
    updateSummary(null);
    renderTable();
    setState("error", error.message || "Gagal mengambil data piutang.");
  } finally {
    state.loading = false;
  }
}

function updateSummary(result) {
  const rows = state.rows;
  const total = rows.reduce((s,r) => s + money(r.total_piutang), 0);
  const current = rows.reduce((s,r) => s + money(r.belum_jatuh_tempo), 0);
  const overdue = rows.reduce((s,r) => s + money(r.aging_1_30) + money(r.aging_31_60) + money(r.aging_61_90) + money(r.aging_91_120) + money(r.aging_121_plus), 0);
  document.querySelector("#sum-customers").textContent = number.format(Number(result?.total_pelanggan ?? rows.length));
  document.querySelector("#sum-total").textContent = formatMoney(Number(result?.total_piutang ?? total));
  document.querySelector("#sum-current").textContent = formatMoney(current);
  document.querySelector("#sum-overdue").textContent = formatMoney(overdue);
}

function filterAndRender() {
  const q = state.search;
  state.filtered = q ? state.rows.filter(r => String(r.kd_pelanggan || "").toLowerCase().includes(q) || String(r.nm_pelanggan || "").toLowerCase().includes(q)) : [...state.rows];
  state.page = Math.min(state.page, Math.max(1, Math.ceil(state.filtered.length / state.pageSize)));
  renderTable();
}

function renderTable() {
  const wrap = document.querySelector("#piutang-table-wrap");
  const cards = document.querySelector("#piutang-cards");
  const pagination = document.querySelector("#piutang-pagination");
  const body = document.querySelector("#piutang-body");

  if (!state.filtered.length) {
    wrap.classList.add("hidden");
    cards.classList.add("hidden");
    pagination.classList.add("hidden");
    if (state.loaded) setState("empty", state.search ? "Tidak ada pelanggan yang cocok dengan pencarian." : "Backend berhasil terhubung, tetapi tidak ada piutang outstanding.");
    return;
  }

  document.querySelector("#piutang-state").classList.add("hidden");
  wrap.classList.remove("hidden");
  cards.classList.remove("hidden");

  const start = (state.page - 1) * state.pageSize;
  const rows = state.filtered.slice(start, start + state.pageSize);
  const pages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));

  body.innerHTML = rows.map(rowHtml).join("");
  cards.innerHTML = rows.map(cardHtml).join("");
  pagination.classList.remove("hidden");
  document.querySelector("#piutang-page-info").textContent = "Halaman " + state.page + " / " + pages + " · " + number.format(state.filtered.length) + " pelanggan";
  document.querySelector("#piutang-prev").disabled = state.page <= 1;
  document.querySelector("#piutang-next").disabled = state.page >= pages;
}

function rowHtml(r) {
  return '<tr><td><div class="customer-cell"><strong>' + esc(r.nm_pelanggan || r.kd_pelanggan) + '</strong><span>' + esc(r.kd_pelanggan) + '</span></div></td>' +
    '<td>' + formatMoney(r.belum_jatuh_tempo) + '</td><td>' + formatMoney(r.aging_1_30) + '</td><td>' + formatMoney(r.aging_31_60) + '</td><td>' + formatMoney(r.aging_61_90) + '</td><td>' + formatMoney(r.aging_91_120) + '</td><td>' + formatMoney(r.aging_121_plus) + '</td><td><strong>' + formatMoney(r.total_piutang) + '</strong></td><td><button class="icon-btn detail-trigger" data-code="' + esc(r.kd_pelanggan) + '">Detail</button></td></tr>';
}

function cardHtml(r) {
  return '<article class="mobile-customer-card"><div class="mobile-customer-head"><div><strong>' + esc(r.nm_pelanggan || r.kd_pelanggan) + '</strong><span>' + esc(r.kd_pelanggan) + '</span></div><button class="icon-btn detail-trigger" data-code="' + esc(r.kd_pelanggan) + '">Detail</button></div><div class="mobile-customer-total"><span>Total Piutang</span><strong>' + formatMoney(r.total_piutang) + '</strong></div><div class="mobile-aging-grid">' +
    '<span>Belum tempo <b>' + formatMoney(r.belum_jatuh_tempo) + '</b></span><span>1–30 <b>' + formatMoney(r.aging_1_30) + '</b></span><span>31–60 <b>' + formatMoney(r.aging_31_60) + '</b></span><span>61–90 <b>' + formatMoney(r.aging_61_90) + '</b></span><span>91–120 <b>' + formatMoney(r.aging_91_120) + '</b></span><span>≥121 <b>' + formatMoney(r.aging_121_plus) + '</b></span></div></article>';
}

function detailClick(e) {
  const btn = e.target.closest(".detail-trigger");
  if (btn) openDetail(btn.dataset.code);
}

async function openDetail(code) {
  const row = state.rows.find(r => String(r.kd_pelanggan) === String(code));
  if (!row) return;
  const modal = document.querySelector("#piutang-modal");
  document.querySelector("#detail-title").textContent = row.nm_pelanggan || code;
  document.querySelector("#detail-code").textContent = code;
  document.querySelector("#detail-content").innerHTML = '<div class="detail-loading">Mengambil detail outstanding...</div>';
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  try {
    const result = await api.customerPiutangDetail(code);
    const tx = Array.isArray(result?.data) ? result.data : [];
    renderDetail(result, tx, row);
  } catch (error) {
    document.querySelector("#detail-content").innerHTML = '<div class="detail-error"><strong>Detail tidak berhasil dimuat.</strong><span>' + esc(error.message || "Unknown error") + '</span></div>';
  }
}

function renderDetail(result, tx, row) {
  const total = tx.reduce((s,r) => s + money(r.piutang), 0) || money(row.total_piutang);
  let html = '<div class="detail-customer"><div><span>Nama</span><strong>' + esc(result?.nama_pelanggan || row.nm_pelanggan || row.kd_pelanggan) + '</strong></div><div><span>Alamat</span><strong>' + esc(result?.alamat || "—") + '</strong></div><div><span>Telepon</span><strong>' + esc(result?.telp || "—") + '</strong></div></div>';
  html += '<div class="detail-total-card"><span>Total Outstanding</span><strong>' + formatMoney(total) + '</strong><small>' + number.format(tx.length) + ' transaksi ditampilkan</small></div>';
  html += '<div class="detail-heading">Transaksi Outstanding</div><div class="detail-table-scroll"><table class="detail-table"><thead><tr><th>Kode</th><th>Tanggal</th><th>Jatuh Tempo</th><th>Umur</th><th>Piutang</th></tr></thead><tbody>';
  html += tx.length ? tx.map(t => '<tr><td>' + esc(t.kode_transaksi) + '</td><td>' + esc(t.tanggal || "—") + '</td><td>' + esc(t.jatuh_tempo || "—") + '</td><td>' + (t.umur_hari == null ? "—" : number.format(t.umur_hari) + " hari") + '</td><td><strong>' + formatMoney(t.piutang) + '</strong></td></tr>').join("") : '<tr><td colspan="5" class="empty-cell">Tidak ada transaksi outstanding.</td></tr>';
  html += '</tbody></table></div>';
  document.querySelector("#detail-content").innerHTML = html;
}

function closeDetail() {
  const modal = document.querySelector("#piutang-modal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function setState(type, message) {
  const el = document.querySelector("#piutang-state");
  el.className = "table-state " + type;
  el.textContent = message;
  el.classList.remove("hidden");
}
