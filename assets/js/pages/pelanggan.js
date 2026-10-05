import { api } from "../api/endpoints.js";

const CUSTOMER_CACHE_KEY = "sidretail:customer:v1";
const CUSTOMER_CACHE_TTL_MS = 2 * 60 * 1000;

const state = {
  loaded: false,
  loading: false,
  rows: [],
  filtered: [],
  page: 1,
  pageSize: 25,
  search: "",
  detailLoading: 0,
  mountId: 0,
  escapeHandler: null
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

let customerMountId = 0;

function isCustomerMounted(mountId) {
  return mountId === customerMountId && Boolean(document.querySelector("#customer-page-size"));
}

function readCustomerCache() {
  try {
    const raw = sessionStorage.getItem(CUSTOMER_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.result)) {
      sessionStorage.removeItem(CUSTOMER_CACHE_KEY);
      return null;
    }

    const savedAt = Number(parsed.savedAt);
    if (!Number.isFinite(savedAt) || savedAt <= 0) {
      sessionStorage.removeItem(CUSTOMER_CACHE_KEY);
      return null;
    }

    return {
      result: parsed.result,
      savedAt,
      ageMs: Math.max(0, Date.now() - savedAt)
    };
  } catch (error) {
    console.warn("[CUSTOMER CACHE] read failed:", error);
    return null;
  }
}

function writeCustomerCache(result, savedAt = Date.now()) {
  try {
    sessionStorage.setItem(
      CUSTOMER_CACHE_KEY,
      JSON.stringify({ version: 1, savedAt, result })
    );
  } catch (error) {
    console.warn("[CUSTOMER CACHE] write failed:", error);
  }
}

function applyCustomerData(result, savedAt) {
  const rows = getRows(result);
  if (!Array.isArray(rows)) return false;

  state.rows = rows.filter((row) =>
    money(row?.saldo_tabungan) > 0 ||
    money(row?.saldo_piutang) > 0
  );
  state.loaded = true;
  state.page = 1;

  filterAndRender();

  const age = Date.now() - Number(savedAt || Date.now());
  setRefreshButton(false, age);
  return true;
}

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
  const mountId = ++customerMountId;
  state.mountId = mountId;

  state.loaded = false;
  state.loading = false;
  state.rows = [];
  state.filtered = [];
  state.page = 1;
  state.search = "";
  state.detailLoading = 0;

  root().innerHTML =
    '<section class="page-heading">' +
      '<div><p class="eyebrow">Master Data</p><h2>Pelanggan Aktif Finansial</h2><p class="page-description">Seluruh pelanggan yang memiliki saldo tabungan atau saldo piutang lebih dari 0. Data dimuat sekali, lalu pencarian dan pagination diproses di browser.</p></div>' +
      '<button id="customer-refresh" class="btn btn-primary">↻ Refresh</button>' +
    '</section>' +

    '<section class="summary-grid">' +
      '<article class="summary-card"><span>Total Pelanggan</span><strong id="customer-loaded">0</strong><small>pelanggan aktif finansial</small></article>' +
      '<article class="summary-card"><span>Dengan Piutang</span><strong id="customer-with-debt">0</strong><small>dari seluruh data aktif</small></article>' +
      '<article class="summary-card"><span>Dengan Tabungan</span><strong id="customer-with-saving">0</strong><small>dari seluruh data aktif</small></article>' +
      '<article class="summary-card"><span>Status Data</span><strong id="customer-status">Siap</strong><small id="customer-status-detail">Memuat seluruh data aktif finansial</small></article>' +
    '</section>' +

    '<section class="card panel">' +
      '<div class="toolbar">' +
        '<div class="search-box"><span>⌕</span><input id="customer-search" type="search" placeholder="Cari kode atau nama..." autocomplete="off"></div>' +
        '<label class="page-size"><span>Baris</span><select id="customer-page-size"><option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="200">200</option></select></label>' +
      '</div>' +
      '<div id="customer-state" class="table-state loading">Memuat seluruh pelanggan aktif finansial...</div>' +
      '<div id="customer-table-wrap" class="table-scroll hidden"><table class="data-table"><thead><tr><th>Pelanggan</th><th>Telepon</th><th>Saldo Tabungan</th><th>Piutang</th><th>Nota Outstanding</th><th></th></tr></thead><tbody id="customer-body"></tbody></table></div>' +
      '<div id="customer-cards" class="mobile-data-cards hidden"></div>' +
      '<div id="customer-pagination" class="pagination hidden"><button id="customer-prev" class="btn btn-light">← Sebelumnya</button><span id="customer-page-info">Halaman 1 / 1</span><button id="customer-next" class="btn btn-light">Berikutnya →</button></div>' +
    '</section>' +

    '<div id="customer-modal" class="modal hidden" aria-hidden="true">' +
      '<div class="modal-backdrop"></div>' +
      '<section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="customer-detail-title">' +
        '<div class="modal-header"><div><p class="eyebrow">Customer Detail</p><h3 id="customer-detail-title">Pelanggan</h3><span id="customer-detail-code" class="modal-code"></span></div><button id="customer-detail-close" class="modal-close" aria-label="Tutup">×</button></div>' +
        '<div id="customer-detail-content" class="modal-body"></div>' +
      '</section>' +
    '</div>';

  bindEvents(mountId);
  document.querySelector("#customer-page-size").value = String(state.pageSize);
  loadCustomers(mountId);
}

function bindEvents(mountId) {
  document.querySelector("#customer-refresh").addEventListener("click", () => loadCustomers(mountId, true));

  document.querySelector("#customer-search").addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    state.page = 1;
    filterAndRender();
  });

  document.querySelector("#customer-page-size").addEventListener("change", (event) => {
    state.pageSize = Number(event.target.value) || 25;
    state.page = 1;
    renderCustomerRows();
  });

  document.querySelector("#customer-prev").addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      renderCustomerRows();
    }
  });

  document.querySelector("#customer-next").addEventListener("click", () => {
    const pages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    if (state.page < pages) {
      state.page += 1;
      renderCustomerRows();
    }
  });

  document.querySelector("#customer-body").addEventListener("click", customerActionClick);
  document.querySelector("#customer-cards").addEventListener("click", customerActionClick);
  document.querySelector("#customer-detail-close").addEventListener("click", closeCustomerDetail);

  if (state.escapeHandler) {
    document.removeEventListener("keydown", state.escapeHandler);
  }
  state.escapeHandler = customerEscapeHandler;
  document.addEventListener("keydown", state.escapeHandler);
}

async function loadCustomers(mountId, force = false) {
  if (state.loading) return;

  const cached = readCustomerCache();

  // Cache fresh: tampilkan langsung tanpa request ulang ke backend.
  if (!force && cached && cached.ageMs < CUSTOMER_CACHE_TTL_MS) {
    applyCustomerData(cached.result, cached.savedAt);
    setCustomerState("", "");
    return;
  }

  // Cache stale: tampilkan data lama terlebih dahulu, lalu refresh di background.
  if (!force && cached) {
    applyCustomerData(cached.result, cached.savedAt);
    setCustomerState("", "");
    refreshCustomersFromBackend(mountId, false);
    return;
  }

  // Manual Refresh: pertahankan data yang sudah tampil dan refresh di background.
  if (force && state.loaded) {
    setRefreshButton(true);
    await refreshCustomersFromBackend(mountId, true);
    return;
  }

  state.loading = true;
  setCustomerState("loading", "Mengambil seluruh pelanggan aktif finansial...");
  setRefreshButton(true);

  try {
    await refreshCustomersFromBackend(mountId, false);
  } finally {
    if (mountId === state.mountId) {
      state.loading = false;
      setRefreshButton(false);
      updatePagination();
    }
  }
}

async function refreshCustomersFromBackend(mountId, isManualRefresh) {
  if (isManualRefresh) state.loading = true;

  try {
    const result = await api.pelanggan();
    if (!isCustomerMounted(mountId)) return;

    const rows = getRows(result);
    if (!Array.isArray(rows)) {
      throw new Error("Struktur respons pelanggan tidak dikenali.");
    }

    writeCustomerCache(result);
    applyCustomerData(result, Date.now());
    setCustomerState("", "");
  } catch (error) {
    if (!isCustomerMounted(mountId)) return;

    if (!state.loaded) {
      state.loaded = false;
      state.rows = [];
      state.filtered = [];
      renderCustomerRows();
      setCustomerState("error", error.message || "Gagal mengambil data pelanggan.");
    } else {
      console.warn("[CUSTOMER CACHE] refresh failed:", error);
      // Data cache tetap ditampilkan. Tidak perlu mengganggu pengguna.
    }
  } finally {
    if (isCustomerMounted(mountId)) {
      state.loading = false;
      setRefreshButton(false);
      updatePagination();
    }
  }
}


function filteredRows() {
  const q = state.search;
  if (!q) return [...state.rows];

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

function filterAndRender() {
  state.filtered = filteredRows();
  const pages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
  state.page = Math.min(state.page, pages);
  renderCustomerRows();
}

function renderCustomerRows() {
  const rows = state.filtered.slice(
    (state.page - 1) * state.pageSize,
    state.page * state.pageSize
  );

  const tableWrap = document.querySelector("#customer-table-wrap");
  const cards = document.querySelector("#customer-cards");
  const body = document.querySelector("#customer-body");
  const stateEl = document.querySelector("#customer-state");
  const pagination = document.querySelector("#customer-pagination");

  if (!body || !cards) return;

  if (!rows.length) {
    tableWrap.classList.add("hidden");
    cards.classList.add("hidden");
    pagination.classList.add("hidden");
    if (!state.loading) {
      setCustomerState(
        "empty",
        state.loaded
          ? (state.search ? "Tidak ada pelanggan yang cocok dengan pencarian." : "Tidak ada pelanggan aktif finansial.")
          : "Belum ada data pelanggan."
      );
    }
  } else {
    tableWrap.classList.remove("hidden");
    cards.classList.remove("hidden");
    stateEl.classList.add("hidden");
    pagination.classList.remove("hidden");

    body.innerHTML = rows.map(customerRowHtml).join("");
    cards.innerHTML = rows.map(customerCardHtml).join("");
  }

  updateCustomerSummary();
  updatePagination();
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
  const withSaving = state.rows.filter((row) => money(row?.saldo_tabungan) > 0).length;

  const loadedEl = document.querySelector("#customer-loaded");
  const debtEl = document.querySelector("#customer-with-debt");
  const savingEl = document.querySelector("#customer-with-saving");
  const statusEl = document.querySelector("#customer-status");
  const detailEl = document.querySelector("#customer-status-detail");

  if (loadedEl) loadedEl.textContent = number.format(loaded);
  if (debtEl) debtEl.textContent = number.format(withDebt);
  if (savingEl) savingEl.textContent = number.format(withSaving);
  if (statusEl) statusEl.textContent = state.loaded ? "Selesai" : "Memuat";
  if (detailEl) {
    detailEl.textContent = state.loaded
      ? number.format(loaded) + " pelanggan aktif finansial dimuat"
      : "Memuat seluruh data aktif finansial";
  }
}

function updatePagination() {
  const previous = document.querySelector("#customer-prev");
  const next = document.querySelector("#customer-next");
  const info = document.querySelector("#customer-page-info");
  const pagination = document.querySelector("#customer-pagination");
  if (!previous || !next || !info || !pagination) return;

  const pages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));

  pagination.classList.toggle("hidden", !state.filtered.length);
  previous.disabled = state.page <= 1 || state.loading;
  next.disabled = state.page >= pages || state.loading;

  info.textContent =
    "Halaman " + number.format(state.page) +
    " / " + number.format(pages) +
    " · " + number.format(state.filtered.length) + " pelanggan" +
    (state.search ? " · hasil pencarian" : "");
}

function setRefreshButton(loading, ageMs = null) {
  const button = document.querySelector("#customer-refresh");
  if (!button) return;

  if (loading) {
    button.disabled = true;
    button.classList.add("ui-busy");
    button.textContent = "Memuat...";
    return;
  }

  button.disabled = false;
  button.classList.remove("ui-busy");
  button.textContent = "↻ Refresh";
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

function customerEscapeHandler(event) {
  if (event.key === "Escape") closeCustomerDetail();
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
  // API contract:
  // pelangganDetail -> { customer: {...} }
  // pelangganTabunganHistory -> { customer: {...}, data: [...], summary: {...} }
  // Jangan membaca field financial dari root response secara asumtif.

  const detailResponse = detailResult?.data || detailResult || {};
  const detail = detailResponse?.customer || detailResponse?.pelanggan || detailResponse || fallbackRow || {};

  // API contract history: { customer, data: [...], summary: {...} }
  // Pertahankan root response agar summary rekonsiliasi tidak hilang.
  const historyResponse = historyResult || {};
  const transactions = Array.isArray(historyResponse?.data)
    ? historyResponse.data
    : Array.isArray(historyResponse)
      ? historyResponse
      : (
          historyResponse?.transactions ||
          historyResponse?.riwayat ||
          historyResponse?.rows ||
          []
        );

  const historySummary = historyResponse?.summary || historyResponse?.data?.summary || {};

  const code =
    detail?.kode_pelanggan ||
    detail?.kode ||
    customerCode(fallbackRow);

  const name =
    detail?.nama ||
    detail?.nama_pelanggan ||
    customerName(fallbackRow);

  const address = detail?.alamat || fallbackRow?.alamat || "—";
  const phone = detail?.telp || fallbackRow?.telp || "—";

  // Nilai saldo utama berasal dari endpoint pelangganDetail.
  const saving = money(
    detail?.saldo_tabungan ??
    fallbackRow?.saldo_tabungan
  );

  const debt = money(
    detail?.saldo_piutang ??
    fallbackRow?.saldo_piutang
  );

  const notes = money(
    detail?.jumlah_nota_outstanding ??
    fallbackRow?.jumlah_nota_outstanding
  );

  // Summary histori berasal dari pelangganTabunganHistory.
  const masterBalance = money(
    historySummary?.saldo_master ?? saving
  );

  const reconstructed = money(
    historySummary?.saldo_rekonstruksi_history
  );

  const difference = money(
    historySummary?.selisih_rekonstruksi_vs_master
  );

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

    '<div class="detail-heading">Posisi Tabungan vs Piutang</div>' +
    '<div class="detail-customer">' +
      '<div><span>Saldo Tabungan</span><strong>' + formatMoney(saving) + '</strong></div>' +
      '<div><span>Saldo Piutang</span><strong>' + formatMoney(debt) + '</strong></div>' +
      '<div><span>Selisih</span><strong>' + (saving - debt > 0 ? '+' : '') + formatMoney(saving - debt) + '</strong></div>' +
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
  const running =
    transaction?.running_balance ??
    transaction?.saldo_berjalan ??
    transaction?.saldoBerjalan ??
    null;

  return '<tr>' +
    '<td>' + esc(transaction?.tanggal || "—") + '</td>' +
    '<td>' + esc(type || "—") + '</td>' +
    '<td>' + esc(transaction?.keterangan || "—") + '</td>' +
    '<td style="text-align:right"><strong>' + (signed >= 0 ? "+" : "−") + formatMoney(Math.abs(signed)) + '</strong></td>' +
    '<td style="text-align:right">' + (running == null ? "—" : formatMoney(running)) + '</td>' +
  '</tr>';
}
