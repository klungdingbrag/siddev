import { api } from "../api/endpoints.js";

const CUSTOMER_CACHE_KEY = "sidretail:pelanggan:v2";
const CUSTOMER_CACHE_TTL_MS = 5 * 60 * 1000;

const state = {
  rows: [],
  page: 1,
  pages: {},
  loading: false,
  loadingPages: {},
  detailLoading: false,
  search: "",
  pageSize: 50,
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

function customerCacheKey() {
  return CUSTOMER_CACHE_KEY + ":" + state.pageSize;
}

function readCustomerCache() {
  try {
    const raw = sessionStorage.getItem(customerCacheKey());
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached?.savedAt || !cached?.state || cached.version !== 3) {
      sessionStorage.removeItem(customerCacheKey());
      return null;
    }
    return {
      state: cached.state,
      ageMs: Date.now() - Number(cached.savedAt)
    };
  } catch (error) {
    console.warn("[Pelanggan] cache read gagal:", error);
    return null;
  }
}

function writeCustomerCache() {
  try {
    sessionStorage.setItem(customerCacheKey(), JSON.stringify({
      version: 3,
      savedAt: Date.now(),
      state: {
        page: state.page,
        pageSize: state.pageSize,
        pages: state.pages
      }
    }));
  } catch (error) {
    console.warn("[Pelanggan] cache write gagal:", error);
  }
}

function restoreCustomerCache(cached) {
  if (!cached?.state?.pages) return false;

  state.page = Number(cached.state.page) || 1;
  state.pageSize = Number(cached.state.pageSize) || 50;
  state.pages = cached.state.pages || {};
  syncCurrentPage();
  return Boolean(state.pages[String(state.page)]);
}

function currentPageData() {
  return state.pages[String(state.page)] || {
    rows: [],
    nextCursor: null,
    hasMore: true
  };
}

function syncCurrentPage() {
  const page = currentPageData();
  state.rows = Array.isArray(page.rows) ? page.rows : [];
}

function pageCursor(pageNumber) {
  if (pageNumber <= 1) return null;
  const previous = state.pages[String(pageNumber - 1)];
  return previous?.nextCursor || null;
}

function totalKnownPages() {
  return Object.keys(state.pages).filter((key) => state.pages[key]).length;
}

function isPageLoading(pageNumber) {
  return Boolean(state.loadingPages[String(pageNumber)]);
}

export function renderPelangganPage() {
  const mountId = ++state.mountId;

  state.loading = false;
  state.loadingPages = {};
  state.detailLoading = false;
  state.search = "";

  const cached = readCustomerCache();
  const restored = cached ? restoreCustomerCache(cached) : false;
  if (!restored) {
    state.page = 1;
    state.pages = {};
    state.rows = [];
  }

  root().innerHTML =
    '<section class="page-heading">' +
      '<div><p class="eyebrow">Master Data</p><h2>Pelanggan</h2><p class="page-description">Menampilkan pelanggan aktif finansial: memiliki saldo tabungan atau saldo piutang > 0.</p></div>' +
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
        '<label class="page-size"><span>Per halaman</span><select id="customer-page-size"><option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="200">200</option></select></label>' +
      '</div>' +
      '<div id="customer-state" class="table-state loading">Memuat pelanggan...</div>' +
      '<div id="customer-table-wrap" class="table-scroll hidden"><table class="data-table"><thead><tr><th>Pelanggan</th><th>Telepon</th><th>Saldo Tabungan</th><th>Piutang</th><th>Nota Outstanding</th><th></th></tr></thead><tbody id="customer-body"></tbody></table></div>' +
      '<div id="customer-cards" class="mobile-data-cards hidden"></div>' +
      '<div class="pagination"><button id="customer-prev" class="btn btn-light">← Sebelumnya</button><span id="customer-page-info">Halaman 1</span><button id="customer-next" class="btn btn-light">Berikutnya →</button></div>' +
    '</section>' +

    '<div id="customer-modal" class="modal hidden" aria-hidden="true">' +
      '<div class="modal-backdrop"></div>' +
      '<section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="customer-detail-title">' +
        '<div class="modal-header"><div><p class="eyebrow">Customer Detail</p><h3 id="customer-detail-title">Pelanggan</h3><span id="customer-detail-code" class="modal-code"></span></div><button id="customer-detail-close" class="modal-close" aria-label="Tutup">×</button></div>' +
        '<div id="customer-detail-content" class="modal-body"></div>' +
      '</section>' +
    '</div>';

  bindEvents(mountId);

  const pageSizeSelect = document.querySelector("#customer-page-size");
  if (pageSizeSelect) pageSizeSelect.value = String(state.pageSize);

  if (restored) {
    renderCustomerRows();
    setCustomerState("", "");
    if (cached.ageMs >= CUSTOMER_CACHE_TTL_MS) {
      loadCustomers(mountId, state.page, true);
    } else {
      prefetchNextPage(mountId, state.page);
    }
  } else {
    renderCustomerRows();
    loadCustomers(mountId, 1, false);
  }
}

function bindEvents(mountId) {
  document.querySelector("#customer-refresh").addEventListener("click", () => {
    if (state.loading) return;
    state.page = 1;
    state.pages = {};
    state.rows = [];
    state.loadingPages = {};
    renderCustomerRows();
    loadCustomers(mountId, 1, true);
  });

  document.querySelector("#customer-search").addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderCustomerRows();
  });

  document.querySelector("#customer-page-size").addEventListener("change", (event) => {
    state.pageSize = Number(event.target.value) || 50;
    state.page = 1;
    state.pages = {};
    state.rows = [];
    state.loadingPages = {};
    sessionStorage.removeItem(customerCacheKey());
    renderCustomerRows();
    loadCustomers(mountId, 1, true);
  });

  document.querySelector("#customer-prev").addEventListener("click", () => {
    if (state.page <= 1 || state.loading) return;
    state.page -= 1;
    syncCurrentPage();
    renderCustomerRows();
    prefetchNextPage(mountId, state.page);
  });

  document.querySelector("#customer-next").addEventListener("click", () => {
    if (state.loading) return;

    const nextPage = state.page + 1;
    if (state.pages[String(nextPage)]) {
      state.page = nextPage;
      syncCurrentPage();
      renderCustomerRows();
      prefetchNextPage(mountId, state.page);
      return;
    }

    if (!currentPageData().hasMore) return;

    // Jika prefetch sedang berjalan, gunakan request yang sama.
    const pending = state.loadingPages[String(nextPage)];
    if (pending && typeof pending.then === "function") {
      pending.then(() => {
        if (mountId !== state.mountId) return;
        if (state.page !== nextPage - 1) return;
        if (!state.pages[String(nextPage)]) return;
        state.page = nextPage;
        syncCurrentPage();
        renderCustomerRows();
        prefetchNextPage(mountId, state.page);
      }).catch(() => {
        if (mountId !== state.mountId) return;
        if (state.page !== nextPage - 1) return;
        // Prefetch gagal: klik Next tetap boleh mencoba request normal.
        loadCustomers(mountId, nextPage, false);
      });
      return;
    }

    loadCustomers(mountId, nextPage, false);
  });

  document.querySelector("#customer-body").addEventListener("click", customerActionClick);
  document.querySelector("#customer-cards").addEventListener("click", customerActionClick);
  document.querySelector("#customer-detail-close").addEventListener("click", closeCustomerDetail);

  // Hindari akumulasi listener ketika route Pelanggan dibuka berulang kali.
  if (state.escapeHandler) {
    document.removeEventListener("keydown", state.escapeHandler);
  }
  state.escapeHandler = customerEscapeHandler;
  document.addEventListener("keydown", state.escapeHandler);
}

async function loadCustomers(mountId, pageNumber, force) {
  if (state.loading && !force) return;

  const cachedPage = state.pages[String(pageNumber)];
  if (!force && cachedPage) {
    state.page = pageNumber;
    syncCurrentPage();
    renderCustomerRows();
    prefetchNextPage(mountId, pageNumber);
    return;
  }

  if (isPageLoading(pageNumber)) return;

  state.loading = true;
  state.loadingPages[String(pageNumber)] = true;
  setCustomerState("loading", pageNumber === 1 ? "Mengambil daftar pelanggan..." : "Mengambil halaman pelanggan...");
  setLoadButton(true);

  try {
    const cursor = pageCursor(pageNumber);
    if (pageNumber > 1 && !cursor) {
      throw new Error("Cursor halaman sebelumnya belum tersedia.");
    }

    const result = await api.pelanggan(state.pageSize, cursor);

    if (mountId !== state.mountId) return;

    const rows = getRows(result);
    const pagination = getPagination(result);

    state.pages[String(pageNumber)] = {
      rows,
      nextCursor: pagination.nextCursor,
      hasMore: pagination.hasMore
    };

    state.page = pageNumber;
    syncCurrentPage();
    writeCustomerCache();

    renderCustomerRows();
    setCustomerState("", "");

    // Ambil halaman berikutnya di background agar tombol Next terasa instan.
    prefetchNextPage(mountId, pageNumber);
  } catch (error) {
    if (mountId !== state.mountId) return;
    setCustomerState("error", error.message || "Gagal mengambil data pelanggan.");
  } finally {
    if (mountId === state.mountId) {
      delete state.loadingPages[String(pageNumber)];
      state.loading = false;
      setLoadButton(false);
      updateLoadMore();
    }
  }
}

async function prefetchNextPage(mountId, pageNumber) {
  if (mountId !== state.mountId) return;

  const pageData = state.pages[String(pageNumber)];
  if (!pageData?.hasMore || !pageData.nextCursor) return;

  const nextPage = pageNumber + 1;
  if (state.pages[String(nextPage)] || isPageLoading(nextPage)) return;

  let resolvePending;
  let rejectPending;
  const pending = new Promise((resolve, reject) => {
    resolvePending = resolve;
    rejectPending = reject;
  });
  state.loadingPages[String(nextPage)] = pending;

  try {
    const result = await api.pelanggan(state.pageSize, pageData.nextCursor);

    if (mountId !== state.mountId) return;

    const rows = getRows(result);
    const pagination = getPagination(result);

    state.pages[String(nextPage)] = {
      rows,
      nextCursor: pagination.nextCursor,
      hasMore: pagination.hasMore
    };

    writeCustomerCache();
    updateLoadMore();
    resolvePending();
  } catch (error) {
    // Prefetch adalah optimasi UX. Jika gagal, Next tetap bisa mencoba lagi.
    console.warn("[Pelanggan] prefetch halaman berikutnya gagal:", error);
    rejectPending(error);
    if (mountId === state.mountId) {
      updateLoadMore();
    }
  } finally {
    if (mountId === state.mountId) {
      delete state.loadingPages[String(nextPage)];
      updateLoadMore();
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
  const pageData = currentPageData();

  const loadedEl = document.querySelector("#customer-loaded");
  const debtEl = document.querySelector("#customer-with-debt");
  const savingEl = document.querySelector("#customer-with-saving");
  const statusEl = document.querySelector("#customer-status");
  const detailEl = document.querySelector("#customer-status-detail");

  if (loadedEl) loadedEl.textContent = number.format(loaded);
  if (debtEl) debtEl.textContent = number.format(withDebt);
  if (savingEl) savingEl.textContent = number.format(withSaving);
  if (statusEl) statusEl.textContent = pageData.hasMore ? "Berlanjut" : "Selesai";
  if (detailEl) detailEl.textContent = pageData.hasMore
    ? "Masih ada data di server"
    : "Halaman terakhir";
}

function updateLoadMore() {
  const previous = document.querySelector("#customer-prev");
  const next = document.querySelector("#customer-next");
  const info = document.querySelector("#customer-page-info");
  const pageData = currentPageData();
  const knownPages = totalKnownPages();

  if (!previous || !next || !info) return;

  previous.disabled = state.loading || state.page <= 1;
  next.disabled = state.loading || (!pageData.hasMore && !state.pages[String(state.page + 1)]);

  previous.textContent = "← Sebelumnya";
  next.textContent = state.loading ? "Memuat..." : "Berikutnya →";

  info.textContent =
    "Halaman " + number.format(state.page) +
    " · " + number.format(state.rows.length) + " pelanggan" +
    (knownPages > 1 ? " · " + number.format(knownPages) + " halaman tersimpan" : "") +
    (state.search ? " · pencarian di halaman ini" : "");
}

function setLoadButton(loading) {
  const previous = document.querySelector("#customer-prev");
  const next = document.querySelector("#customer-next");
  if (!previous || !next) return;
  previous.disabled = loading || state.page <= 1;
  next.disabled = loading;
  next.textContent = loading
    ? "Memuat..."
    : "Berikutnya →";
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

  const historyResponse = historyResult?.data || historyResult || {};
  const transactions = Array.isArray(historyResponse)
    ? historyResponse
    : (
        historyResponse?.data ||
        historyResponse?.transactions ||
        historyResponse?.riwayat ||
        historyResponse?.rows ||
        []
      );

  const historySummary = historyResponse?.summary || {};

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
