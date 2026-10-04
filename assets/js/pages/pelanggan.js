import { api } from "../api/endpoints.js";

const state = {
  rows: [],
  cursor: null,
  hasMore: true,
  loading: false,
  detailLoading: false,
  search: "",
  pageSize: 50,
  mountId: 0
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
});

const number = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0
});

const root = () => document.querySelector("#page-content");

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value) {
  return rupiah.format(money(value));
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getRows(result) {
  if (Array.isArray(result)) return result;

  const candidates = [
    result?.rows,
    result?.customers,
    result?.pelanggan,
    result?.data,
    result?.data?.rows,
    result?.data?.customers,
    result?.data?.pelanggan
  ];

  return candidates.find(Array.isArray) || [];
}

function getPagination(result) {
  const p = result?.pagination || result?.data?.pagination || {};
  return {
    nextCursor: p.next_cursor ?? p.nextCursor ?? null,
    hasMore: Boolean(p.has_more ?? p.hasMore)
  };
}

function customerName(row) {
  return row?.nama || row?.nama_pelanggan || row?.nm_pelanggan || "Tanpa nama";
}

function customerCode(row) {
  return row?.kode_pelanggan || row?.kode || row?.kd_pelanggan || "";
}

export function renderPelangganPage() {
  const mountId = ++state.mountId;

  state.rows = [];
  state.cursor = null;
  state.hasMore = true;
  state.loading = false;
  state.detailLoading = false;
  state.search = "";

  root().innerHTML =
    '<section class="page-heading">' +
      '<div><p class="eyebrow">Master Data</p><h2>Pelanggan</h2><p class="page-description">Daftar seluruh pelanggan dari SID Retail. Semua klasifikasi internal diperlakukan sebagai satu entitas pelanggan di frontend.</p></div>' +
      '<button id="customer-refresh" class="btn btn-primary">↻ Refresh</button>' +
    '</section>' +

    '<section class="summary-grid">' +
      '<article class="summary-card"><span>Data Dimuat</span><strong id="customer-loaded">0</strong><small>pelanggan pada sesi ini</small></article>' +
      '<article class="summary-card"><span>Dengan Piutang</span><strong id="customer-with-debt">0</strong><small>berdasarkan data yang sudah dimuat</small></article>' +
      '<article class="summary-card"><span>Dengan Tabungan</span><strong id="customer-with-saving">0</strong><small>berdasarkan data yang sudah dimuat</small></article>' +
      '<article class="summary-card"><span>Status Data</span><strong id="customer-status">Siap</strong><small id="customer-status-detail">Memuat halaman pertama</small></article>' +
    '</section>' +

    '<section class="card panel">' +
      '<div class="toolbar">' +
        '<div class="search-box"><span>⌕</span><input id="customer-search" type="search" placeholder="Cari kode atau nama..." autocomplete="off"></div>' +
        '<label class="page-size"><span>Ambil</span><select id="customer-page-size"><option value="25">25</option><option value="50" selected>50</option><option value="100">100</option><option value="200">200</option></select></label>' +
      '</div>' +
      '<div id="customer-state" class="table-state loading">Memuat pelanggan...</div>' +
      '<div id="customer-table-wrap" class="table-scroll hidden"><table class="data-table"><thead><tr><th>Pelanggan</th><th>Telepon</th><th>Saldo Tabungan</th><th>Piutang</th><th>Nota Outstanding</th><th></th></tr></thead><tbody id="customer-body"></tbody></table></div>' +
      '<div id="customer-cards" class="mobile-data-cards hidden"></div>' +
      '<div class="pagination"><button id="customer-load-more" class="btn btn-light">Muat berikutnya</button><span id="customer-page-info">0 pelanggan dimuat</span></div>' +
    '</section>' +

    '<div id="customer-modal" class="modal hidden" aria-hidden="true">' +
      '<div class="modal-backdrop" data-close-customer></div>' +
      '<section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="customer-detail-title">' +
        '<div class="modal-header"><div><p class="eyebrow">Customer Detail</p><h3 id="customer-detail-title">Pelanggan</h3><span id="customer-detail-code" class="modal-code"></span></div><button id="customer-detail-close" class="modal-close" aria-label="Tutup">×</button></div>' +
        '<div id="customer-detail-content" class="modal-body"></div>' +
      '</section>' +
    '</div>';

  bindEvents(mountId);
  loadCustomers(mountId, true);
}

function bindEvents(mountId) {
  document.querySelector("#customer-refresh").addEventListener("click", () => {
    if (state.loading) return;
    state.rows = [];
    state.cursor = null;
    state.hasMore = true;
    renderCustomerRows();
    loadCustomers(mountId, true);
  });

  document.querySelector("#customer-search").addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderCustomerRows();
  });

  document.querySelector("#customer-page-size").addEventListener("change", (event) => {
    state.pageSize = Number(event.target.value) || 50;
    state.rows = [];
    state.cursor = null;
    state.hasMore = true;
    renderCustomerRows();
    loadCustomers(mountId, true);
  });

  document.querySelector("#customer-load-more").addEventListener("click", () => {
    loadCustomers(mountId, false);
  });

  document.querySelector("#customer-body").addEventListener("click", customerActionClick);
  document.querySelector("#customer-cards").addEventListener("click", customerActionClick);
  document.querySelector("#customer-detail-close").addEventListener("click", closeCustomerDetail);

  document.querySelector("#customer-modal").addEventListener("click", (event) => {
    if (event.target.closest("[data-close-customer]")) closeCustomerDetail();
  });

  document.addEventListener("keydown", function customerEscape(event) {
    if (event.key === "Escape") closeCustomerDetail();
  }, { once: true });
}

async function loadCustomers(mountId, reset) {
  if (state.loading || !state.hasMore) return;

  state.loading = true;
  setCustomerState("loading", reset ? "Mengambil daftar pelanggan..." : "Mengambil halaman pelanggan berikutnya...");
  setLoadButton(true);

  try {
    const result = await api.pelanggan(state.pageSize, state.cursor);

    if (mountId !== state.mountId) return;

    const rows = getRows(result);
    const pagination = getPagination(result);

    if (reset) state.rows = [];
    state.rows.push(...rows);
    state.cursor = pagination.nextCursor;
    state.hasMore = pagination.hasMore;

    renderCustomerRows();
    setCustomerState("", "");
  } catch (error) {
    if (mountId !== state.mountId) return;
    setCustomerState("error", error.message || "Gagal mengambil data pelanggan.");
  } finally {
    if (mountId === state.mountId) {
      state.loading = false;
      setLoadButton(false);
    }
  }
}

function filteredRows() {
  const q = state.search;
  if (!q) return state.rows;

  return state.rows.filter((row) => {
    const haystack = [
      customerCode(row),
      customerName(row),
      row?.alamat,
      row?.telp
    ].join(" ").toLowerCase();

    return haystack.includes(q);
  });
}

function renderCustomerRows() {
  const rows = filteredRows();

  const tableWrap = document.querySelector("#customer-table-wrap");
  const cards = document.querySelector("#customer-cards");
  const body = document.querySelector("#customer-body");
  const stateEl = document.querySelector("#customer-state");

  if (!body || !cards) return;

  if (!state.loading) stateEl.classList.add("hidden");

  if (!rows.length) {
    tableWrap.classList.add("hidden");
    cards.classList.add("hidden");
    if (!state.loading) setCustomerState("empty", state.rows.length ? "Tidak ada pelanggan yang cocok dengan pencarian." : "Belum ada data pelanggan.");
  } else {
    tableWrap.classList.remove("hidden");
    cards.classList.remove("hidden");

    body.innerHTML = rows.map(customerRowHtml).join("");
    cards.innerHTML = rows.map(customerCardHtml).join("");
  }

  updateCustomerSummary();
  updateLoadMore();
}

function customerRowHtml(row) {
  const code = customerCode(row);
  const name = customerName(row);

  return '<tr>' +
    '<td><div class="customer-cell"><strong>' + esc(name) + '</strong><span>' + esc(code) + '</span><span>' + esc(row?.alamat || "Alamat tidak tersedia") + '</span></div></td>' +
    '<td>' + esc(row?.telp || "—") + '</td>' +
    '<td><strong>' + formatMoney(row?.saldo_tabungan) + '</strong></td>' +
    '<td><strong>' + formatMoney(row?.saldo_piutang) + '</strong></td>' +
    '<td>' + number.format(money(row?.jumlah_nota_outstanding)) + '</td>' +
    '<td><button class="icon-btn" data-customer-code="' + esc(code) + '">Detail</button></td>' +
  '</tr>';
}

function customerCardHtml(row) {
  const code = customerCode(row);
  const name = customerName(row);

  return '<article class="mobile-customer-card">' +
    '<div class="mobile-customer-head"><div><strong>' + esc(name) + '</strong><span>' + esc(code) + '</span></div><button class="icon-btn" data-customer-code="' + esc(code) + '">Detail</button></div>' +
    '<div class="mobile-customer-total"><span>Piutang</span><strong>' + formatMoney(row?.saldo_piutang) + '</strong></div>' +
    '<div class="mobile-aging-grid">' +
      '<span>Tabungan<b>' + formatMoney(row?.saldo_tabungan) + '</b></span>' +
      '<span>Nota outstanding<b>' + number.format(money(row?.jumlah_nota_outstanding)) + '</b></span>' +
    '</div>' +
  '</article>';
}

function updateCustomerSummary() {
  const loaded = state.rows.length;
  const withDebt = state.rows.filter((row) => money(row?.saldo_piutang) > 0).length;
  const withSaving = state.rows.filter((row) => money(row?.saldo_tabungan) !== 0).length;

  const loadedEl = document.querySelector("#customer-loaded");
  const debtEl = document.querySelector("#customer-with-debt");
  const savingEl = document.querySelector("#customer-with-saving");
  const statusEl = document.querySelector("#customer-status");
  const detailEl = document.querySelector("#customer-status-detail");

  if (loadedEl) loadedEl.textContent = number.format(loaded);
  if (debtEl) debtEl.textContent = number.format(withDebt);
  if (savingEl) savingEl.textContent = number.format(withSaving);
  if (statusEl) statusEl.textContent = state.hasMore ? "Berlanjut" : "Selesai";
  if (detailEl) detailEl.textContent = state.hasMore ? "Masih ada data di server" : "Seluruh data sudah dimuat";
}

function updateLoadMore() {
  const button = document.querySelector("#customer-load-more");
  const info = document.querySelector("#customer-page-info");
  if (!button || !info) return;

  button.disabled = state.loading || !state.hasMore;
  button.textContent = state.loading
    ? "Memuat..."
    : state.hasMore
      ? "Muat berikutnya"
      : "Semua data dimuat";

  info.textContent = number.format(state.rows.length) + " pelanggan dimuat" +
    (state.search ? " • hasil pencarian dari data yang dimuat" : "");
}

function setLoadButton(loading) {
  const button = document.querySelector("#customer-load-more");
  if (!button) return;
  button.disabled = loading || !state.hasMore;
  if (loading) button.textContent = "Memuat...";
}

function setCustomerState(type, message) {
  const el = document.querySelector("#customer-state");
  if (!el) return;

  el.className = "table-state" + (type ? " " + type : " hidden");
  el.textContent = message || "";
}

async function customerActionClick(event) {
  const button = event.target.closest("[data-customer-code]");
  if (!button) return;

  const code = button.dataset.customerCode;
  if (code) await openCustomerDetail(code);
}

async function openCustomerDetail(code) {
  const modal = document.querySelector("#customer-modal");
  const content = document.querySelector("#customer-detail-content");
  const title = document.querySelector("#customer-detail-title");
  const codeEl = document.querySelector("#customer-detail-code");

  const row = state.rows.find((item) => customerCode(item) === code) || {};
  title.textContent = customerName(row);
  codeEl.textContent = code;
  content.innerHTML = '<div class="detail-loading">Mengambil detail pelanggan...</div>';
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  const requestId = ++state.detailLoading;

  try {
    const [detail, history] = await Promise.all([
      api.pelangganDetail(code),
      api.pelangganTabunganHistory(code, 100)
    ]);

    if (requestId !== state.detailLoading) return;

    renderCustomerDetail(detail, history, row);
  } catch (error) {
    if (requestId !== state.detailLoading) return;
    content.innerHTML =
      '<div class="detail-error"><strong>Gagal mengambil detail pelanggan.</strong><span>' +
      esc(error.message || "Unknown error") +
      '</span></div>';
  }
}

function closeCustomerDetail() {
  const modal = document.querySelector("#customer-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  state.detailLoading += 1;
}

function renderCustomerDetail(detailResult, historyResult, fallbackRow) {
  const detail = detailResult?.data || detailResult || {};
  const history = historyResult?.data || historyResult || {};
  const row = detail?.customer || detail?.pelanggan || detail || fallbackRow || {};

  const code = detail?.kode_pelanggan || row?.kode || customerCode(fallbackRow);
  const name = detail?.nama || row?.nama || customerName(fallbackRow);
  const address = detail?.alamat || row?.alamat || "—";
  const phone = detail?.telp || row?.telp || "—";
  const saving = money(detail?.saldo_tabungan ?? row?.saldo_tabungan);
  const debt = money(detail?.saldo_piutang);
  const notes = money(detail?.jumlah_nota_outstanding);

  const transactions =
    history?.transactions ||
    history?.riwayat ||
    history?.rows ||
    history?.data ||
    [];

  const masterBalance = money(history?.saldo_master ?? saving);
  const reconstructed = money(history?.saldo_rekonstruksi_history);
  const difference = money(history?.selisih_rekonstruksi_vs_master);

  const content = document.querySelector("#customer-detail-content");
  if (!content) return;

  content.innerHTML =
    '<div class="detail-customer">' +
      '<div><span>Nama</span><strong>' + esc(name) + '</strong></div>' +
      '<div><span>Kode pelanggan</span><strong>' + esc(code) + '</strong></div>' +
      '<div><span>Telepon</span><strong>' + esc(phone) + '</strong></div>' +
      '<div class="detail-customer-full"><span>Alamat</span><strong>' + esc(address) + '</strong></div>' +
    '</div>' +

    '<div class="detail-financial-grid">' +
      '<div class="financial-card savings"><span>Saldo Tabungan</span><strong>' + formatMoney(saving) + '</strong></div>' +
      '<div class="financial-card debt"><span>Saldo Piutang</span><strong>' + formatMoney(debt) + '</strong></div>' +
    '</div>' +

    '<div class="summary-grid" style="margin-top:14px;margin-bottom:0">' +
      '<article class="summary-card"><span>Nota Outstanding</span><strong>' + number.format(notes) + '</strong><small>nota dengan piutang > 0</small></article>' +
      '<article class="summary-card"><span>Riwayat Tabungan</span><strong>' + number.format(transactions.length) + '</strong><small>transaksi yang dimuat</small></article>' +
    '</div>' +

    '<div class="detail-heading">Riwayat Tabungan</div>' +
    '<div class="detail-table-scroll"><table class="detail-table"><thead><tr><th>Tanggal</th><th>Jenis</th><th>Keterangan</th><th>Jumlah</th><th>Saldo Berjalan</th></tr></thead><tbody>' +
      (transactions.length ? transactions.map(historyRowHtml).join("") : '<tr><td colspan="5" class="empty-cell">Tidak ada riwayat tabungan.</td></tr>') +
    '</tbody></table></div>' +

    '<div class="detail-heading">Rekonsiliasi</div>' +
    '<div class="detail-customer">' +
      '<div><span>Saldo master</span><strong>' + formatMoney(masterBalance) + '</strong></div>' +
      '<div><span>Saldo rekonstruksi</span><strong>' + formatMoney(reconstructed) + '</strong></div>' +
      '<div><span>Selisih</span><strong>' + formatMoney(difference) + '</strong></div>' +
    '</div>';

  document.querySelector("#customer-detail-title").textContent = name;
  document.querySelector("#customer-detail-code").textContent = code;
}

function historyRowHtml(transaction) {
  const type = String(transaction?.jenis || "").toUpperCase();
  const amount = money(transaction?.jumlah);
  const signed = type === "AMBIL" ? -amount : amount;
  const running = transaction?.saldo_berjalan ?? transaction?.saldoBerjalan ?? null;

  return '<tr>' +
    '<td>' + esc(transaction?.tanggal || "—") + '</td>' +
    '<td>' + esc(type || "—") + '</td>' +
    '<td>' + esc(transaction?.keterangan || "—") + '</td>' +
    '<td style="text-align:right"><strong>' + (signed >= 0 ? "+" : "−") + formatMoney(Math.abs(signed)) + '</strong></td>' +
    '<td style="text-align:right">' + (running == null ? "—" : formatMoney(running)) + '</td>' +
  '</tr>';
}
