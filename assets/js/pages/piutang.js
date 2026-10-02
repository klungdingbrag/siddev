import { api } from "../api/endpoints.js";

const state = {
  loaded: false,
  loading: false,
  rows: [],
  filtered: [],
  page: 1,
  pageSize: 25,
  search: "",
  detailCode: null,
  detailRow: null,
  detailData: null,
  tabungan: 0
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
});
const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(v) {
  return rupiah.format(money(v));
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const root = () => document.querySelector("#page-content");

const PIUTANG_CACHE_KEY = "sidretail:piutang:v1";
const PIUTANG_CACHE_TTL_MS = 2 * 60 * 1000;

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
    '<div id="piutang-modal" class="modal hidden" aria-hidden="true"><div class="modal-backdrop" data-close-detail></div><section class="modal-panel modal-panel-detail" role="dialog" aria-modal="true"><div class="modal-header"><div><h3 id="detail-title">Detail Pelanggan</h3><span id="detail-code" class="modal-code"></span></div><button id="detail-close" class="modal-close" aria-label="Tutup">×</button></div><div id="detail-content" class="modal-body"></div><div id="detail-footer" class="detail-footer hidden"></div></section></div>' +
    '<div id="action-modal" class="modal hidden" aria-hidden="true"><div class="modal-backdrop" data-close-action></div><section class="modal-panel action-modal-panel" role="dialog" aria-modal="true"><div class="modal-header"><div><p class="eyebrow">WhatsApp</p><h3>Pilih kontak tujuan</h3></div><button id="action-close" class="modal-close" aria-label="Tutup">×</button></div><div id="action-content" class="modal-body"></div></section></div>';

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
    // Popup detail hanya ditutup melalui tombol Tutup (atau Escape), bukan klik backdrop.

    const btn = e.target.closest("[data-pdf-action]");
    if (btn) handlePdfAction(btn.dataset.pdfAction, btn.dataset.code);
    const wa = e.target.closest("[data-wa-action]");
    if (wa) openWhatsAppPicker(wa.dataset.waAction, wa.dataset.code, wa.dataset.name || "");
  });
  document.querySelector("#action-close").addEventListener("click", closeActionModal);
  document.querySelector("#action-modal").addEventListener("click", actionModalClick);
}

async function loadPiutang(force = false) {
  if (state.loading) return;

  const cached = readPiutangCache();

  // Cache fresh: tampilkan langsung tanpa request ulang ke backend.
  if (!force && cached && cached.ageMs < PIUTANG_CACHE_TTL_MS) {
    applyPiutangData(cached.result, cached.savedAt);
    return;
  }

  // Cache stale: tampilkan data yang ada terlebih dahulu, lalu refresh
  // di background agar perpindahan menu tetap terasa ringan.
  if (!force && cached) {
    applyPiutangData(cached.result, cached.savedAt);
    refreshPiutangFromBackend(false);
    return;
  }

  // Manual Refresh tetap memaksa request terbaru. Jika data lama sudah
  // tampil, jangan mengosongkan tabel dan jangan menampilkan loading penuh.
  if (force && state.loaded) {
    setRefreshState(true);
    await refreshPiutangFromBackend(true);
    return;
  }

  state.loading = true;
  setState("loading", "Mengambil data piutang dari Development backend...");
  try {
    await refreshPiutangFromBackend(false);
  } finally {
    state.loading = false;
  }
}

async function refreshPiutangFromBackend(isManualRefresh) {
  if (isManualRefresh) state.loading = true;

  try {
    if (isManualRefresh) setRefreshState(true);

    const result = await api.piutang();
    const rows = extractPiutangRows(result);

    if (!rows) {
      throw new Error(
        "Struktur respons piutang tidak dikenali. " +
        "API berhasil tetapi daftar pelanggan tidak ditemukan."
      );
    }

    const normalizedRows = rows.filter(r => money(r.total_piutang) > 0);
    const savedAt = Date.now();

    writePiutangCache(result, savedAt);
    state.rows = normalizedRows;
    state.loaded = true;
    state.page = 1;
    updateSummary(result);
    filterAndRender();
  } catch (error) {
    if (!state.loaded) {
      state.loaded = false;
      state.rows = [];
      state.filtered = [];
      updateSummary(null);
      renderTable();
      setState("error", error.message || "Gagal mengambil data piutang.");
    } else {
      showToast("Refresh piutang gagal: " + (error.message || "Unknown error"), true);
    }
  } finally {
    if (isManualRefresh) {
      state.loading = false;
      setRefreshState(false);
    }
  }
}

function applyPiutangData(result, savedAt) {
  const rows = extractPiutangRows(result);
  if (!rows) return false;

  state.rows = rows.filter(r => money(r.total_piutang) > 0);
  state.loaded = true;
  state.page = 1;
  updateSummary(result);
  filterAndRender();

  const age = Date.now() - Number(savedAt || Date.now());
  setRefreshState(false, age);
  return true;
}

function readPiutangCache() {
  try {
    const raw = sessionStorage.getItem(PIUTANG_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.result || !Array.isArray(extractPiutangRows(parsed.result))) {
      sessionStorage.removeItem(PIUTANG_CACHE_KEY);
      return null;
    }

    const savedAt = Number(parsed.savedAt);
    if (!Number.isFinite(savedAt) || savedAt <= 0) {
      sessionStorage.removeItem(PIUTANG_CACHE_KEY);
      return null;
    }

    return {
      result: parsed.result,
      savedAt,
      ageMs: Math.max(0, Date.now() - savedAt)
    };
  } catch (error) {
    console.warn("[PIUTANG CACHE] read failed:", error);
    return null;
  }
}

function writePiutangCache(result, savedAt = Date.now()) {
  try {
    sessionStorage.setItem(
      PIUTANG_CACHE_KEY,
      JSON.stringify({ version: 1, savedAt, result })
    );
  } catch (error) {
    // Cache adalah optimasi saja. Kegagalan storage tidak boleh mengganggu aplikasi.
    console.warn("[PIUTANG CACHE] write failed:", error);
  }
}

function setRefreshState(active, ageMs = null) {
  const button = document.querySelector("#piutang-refresh");
  if (!button) return;

  if (active) {
    button.disabled = true;
    button.classList.add("ui-busy");
    button.dataset.originalText = button.dataset.originalText || button.textContent;
    button.textContent = "Memperbarui...";
    return;
  }

  button.disabled = false;
  button.classList.remove("ui-busy");
  button.textContent = button.dataset.originalText || "↻ Refresh";
}

function extractPiutangRows(result) {
  if (Array.isArray(result)) return result;

  // API V1 piutang returns an object containing the customer rows.
  // Keep compatibility with earlier/alternate envelopes without changing backend.
  const candidates = [
    result?.rows,
    result?.pelanggan,
    result?.customers,
    result?.data,
    result?.data?.rows,
    result?.data?.pelanggan,
    result?.data?.customers
  ];

  for (const value of candidates) {
    if (Array.isArray(value)) return value;
  }

  return null;
}

function updateSummary(result) {
  const rows = state.rows;
  const total = rows.reduce((s, r) => s + money(r.total_piutang), 0);
  const current = rows.reduce((s, r) => s + money(r.belum_jatuh_tempo), 0);
  const overdue = rows.reduce((s, r) =>
    s + money(r.aging_1_30) + money(r.aging_31_60) + money(r.aging_61_90) +
    money(r.aging_91_120) + money(r.aging_121_plus), 0);
  document.querySelector("#sum-customers").textContent = number.format(Number(result?.total_pelanggan ?? rows.length));
  document.querySelector("#sum-total").textContent = formatMoney(Number(result?.total_piutang ?? total));
  document.querySelector("#sum-current").textContent = formatMoney(current);
  document.querySelector("#sum-overdue").textContent = formatMoney(overdue);
}

function filterAndRender() {
  const q = state.search;
  state.filtered = q
    ? state.rows.filter(r =>
        String(r.kd_pelanggan || "").toLowerCase().includes(q) ||
        String(r.nm_pelanggan || "").toLowerCase().includes(q))
    : [...state.rows];
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
  document.querySelector("#piutang-page-info").textContent =
    "Halaman " + state.page + " / " + pages + " · " + number.format(state.filtered.length) + " pelanggan";
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

  state.detailCode = code;
  state.detailRow = row;
  state.detailData = null;
  state.tabungan = 0;

  const modal = document.querySelector("#piutang-modal");
  document.querySelector("#detail-title").textContent = "Detail Pelanggan";
  document.querySelector("#detail-code").textContent = code;
  document.querySelector("#detail-content").innerHTML = '<div class="detail-loading">Mengambil detail pelanggan, piutang, dan saldo tabungan...</div>';
  document.querySelector("#detail-footer").classList.add("hidden");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  try {
    const [detailResult, tabunganResult] = await Promise.all([
      api.customerPiutangDetail(code),
      api.tabungan(code).catch(() => null)
    ]);
    state.detailData = detailResult;
    state.tabungan = extractTabungan(tabunganResult, detailResult);
    renderDetail(detailResult, row);
  } catch (error) {
    document.querySelector("#detail-content").innerHTML =
      '<div class="detail-error"><strong>Detail tidak berhasil dimuat.</strong><span>' +
      esc(error.message || "Unknown error") + '</span></div>';
  }
}

function extractTabungan(result, detail) {
  const candidates = [
    result?.saldo_tabungan,
    result?.data?.saldo_tabungan,
    detail?.saldo_tabungan,
    detail?.data?.saldo_tabungan,
    result?.saldo,
    result?.data?.saldo,
    typeof result === "number" ? result : null
  ];
  for (const v of candidates) {
    if (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return 0;
}

function extractTransactions(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.transaksi)) return result.transaksi;
  if (Array.isArray(result?.data?.transaksi)) return result.data.transaksi;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
}

function customerValue(result, row, keys, fallback = "") {
  for (const key of keys) {
    const a = result?.[key];
    const b = result?.data?.[key];
    if (a !== undefined && a !== null && a !== "") return a;
    if (b !== undefined && b !== null && b !== "") return b;
  }
  return fallback;
}

function renderDetail(result, row) {
  const tx = extractTransactions(result);
  const name = customerValue(result, row, ["nama_pelanggan", "nm_pelanggan", "nama"], row.nm_pelanggan || row.kd_pelanggan);
  const address = customerValue(result, row, ["alamat", "alamat_pelanggan"], "—");
  const phone = customerValue(result, row, ["telp", "telepon", "no_wa", "nomor_wa", "whatsapp"], "Tidak tersedia");

  const total = money(customerValue(result, row, ["total_piutang", "saldo_hutang", "total_outstanding"], row.total_piutang));
  const aging = {
    current: money(row.belum_jatuh_tempo),
    a30: money(row.aging_1_30),
    a60: money(row.aging_31_60),
    a90: money(row.aging_61_90),
    a120: money(row.aging_91_120),
    a121: money(row.aging_121_plus)
  };

  let html =
    '<div class="detail-customer">' +
      '<div class="detail-customer-full"><span>Nama</span><strong>' + esc(name) + '</strong></div>' +
      '<div><span>Alamat</span><strong>' + esc(address) + '</strong></div>' +
      '<div><span>No. WhatsApp</span><strong>' + esc(phone) + '</strong></div>' +
    '</div>' +

    '<div class="detail-aging-grid">' +
      agingCard("Belum Jatuh Tempo", aging.current, "current") +
      agingCard("1 s/d 30 Hari", aging.a30, "warning") +
      agingCard("31 s/d 60 Hari", aging.a60, "warning") +
      agingCard("61 s/d 90 Hari", aging.a90, "warning") +
      agingCard("91 s/d 120 Hari", aging.a120, "warning") +
      agingCard("≥121 Hari", aging.a121, "danger") +
    '</div>' +

    '<div class="detail-financial-grid">' +
      '<div class="financial-card savings"><span>Saldo Tabungan</span><strong>' + formatMoney(state.tabungan) + '</strong></div>' +
      '<div class="financial-card debt"><span>Total Piutang</span><strong>' + formatMoney(total) + '</strong></div>' +
    '</div>' +

    '<div class="detail-heading">Transaksi Outstanding</div>' +
    '<div class="detail-table-scroll"><table class="detail-table"><thead><tr><th>Kode</th><th>Tanggal</th><th>Jatuh Tempo</th><th>Umur</th><th>Piutang</th><th>Aksi</th></tr></thead><tbody>';

  html += tx.length
    ? tx.map(t => invoiceRowHtml(t, name)).join("")
    : '<tr><td colspan="6" class="empty-cell">Tidak ada transaksi outstanding.</td></tr>';

  html += '</tbody></table></div>';

  document.querySelector("#detail-content").innerHTML = html;

  document.querySelector("#detail-footer").innerHTML =
    '<div class="detail-footer-left">' +
      '<button class="btn btn-light" data-pdf-action="summary" data-code="' + esc(state.detailCode) + '"><span class="action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v5h5"></path><path d="M9 13h6M9 17h6"></path></svg></span>Ringkasan PDF</button>' +
      '<button class="btn btn-light" data-pdf-action="detail" data-code="' + esc(state.detailCode) + '"><span class="action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M6 3h12v18H6z"></path><path d="M9 8h6M9 12h6M9 16h4"></path></svg></span>Laporan Detail PDF</button>' +
    '</div>' +
    '<div class="detail-footer-right">' +
      '<button class="btn btn-light" id="detail-footer-close">Tutup</button>' +
      '<button class="btn btn-whatsapp" data-wa-action="customer" data-code="' + esc(state.detailCode) + '" data-name="' + esc(name) + '"><span class="action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z"></path><path d="M9 8.5c.2 1.6 1.4 3.4 3.2 4.4 1.4.8 2.5.9 3.2.5"></path></svg></span>Share WhatsApp</button>' +
    '</div>';
  document.querySelector("#detail-footer").classList.remove("hidden");
  document.querySelector("#detail-footer-close").addEventListener("click", closeDetail);
}

function agingCard(label, value, tone) {
  return '<div class="aging-card aging-' + tone + '"><span>' + label + '</span><strong>' + formatMoney(value) + '</strong></div>';
}

function invoiceRowHtml(t, name) {
  const code = t.kode_transaksi || t.kode || "";
  const date = t.tanggal || "—";
  const due = t.jatuh_tempo || t.jatuhTempo || "—";
  const age = t.umur_hari == null ? "—" : number.format(t.umur_hari) + " hari";
  const balance = t.piutang ?? t.saldo_hutang ?? t.saldo ?? 0;

  return '<tr>' +
    '<td>' + esc(code) + '</td>' +
    '<td>' + esc(date) + '</td>' +
    '<td>' + esc(due) + '</td>' +
    '<td>' + esc(age) + '</td>' +
    '<td><strong>' + formatMoney(balance) + '</strong></td>' +
    '<td><div class="invoice-actions">' +
      '<button class="mini-action" data-pdf-action="invoice" data-code="' + esc(code) + '" title="Buka PDF Invoice"><span class="action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v5h5"></path><path d="M9 13h6M9 17h6"></path></svg></span>PDF</button>' +
      '<button class="mini-action whatsapp-mini" data-wa-action="invoice" data-code="' + esc(code) + '" data-name="' + esc(name) + '" title="Bagikan Invoice ke WhatsApp"><span class="action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z"></path><path d="M9 8.5c.2 1.6 1.4 3.4 3.2 4.4 1.4.8 2.5.9 3.2.5"></path></svg></span>WhatsApp</button>' +
    '</div></td>' +
  '</tr>';
}

async function handlePdfAction(type, code) {
  if (type === "invoice") {
    if (!code) return;
    await generatePdf(
      () => api.pdfInvoice(code),
      "Invoice PDF"
    );
    return;
  }

  if (!code) return;
  if (type === "summary") {
    await generatePdf(
      () => api.pdfRingkasanPiutang({ kode_pelanggan: code }),
      "Ringkasan Piutang PDF"
    );
    return;
  }

  if (type === "detail") {
    await generatePdf6D2(code);
  }
}

async function generatePdf6D2(code) {
  setPdfLoading(true, "Membuat Laporan Detail PDF 6D.2...", "PDF sedang dibuat. Mohon tunggu.");
  try {
    const data = await api.pdfSemuaDetailPiutang6D2(code);
    const payload = extractPdfPayload(data);
    if (!payload.base64) throw new Error("Backend tidak mengembalikan pdf_base64.");

    const bytes = base64ToBytes(payload.base64);
    const transportCheck = validatePdfBytes(bytes);

    console.info("[PDF 6D.2] transport check", {
      base64Length: payload.base64.length,
      expectedSize: payload.expectedSize,
      decodedSize: bytes.length,
      sizeMatch: payload.expectedSize ? bytes.length === payload.expectedSize : null,
      header: transportCheck.header,
      startxref: transportCheck.startxref,
      eof: transportCheck.eof
    });

    if (bytes.length < 100 || !transportCheck.header) {
      throw new Error("PDF yang diterima kosong atau header PDF tidak valid.");
    }

    if (!transportCheck.startxref || !transportCheck.eof) {
      throw new Error(
        "PDF 6D.2 diterima lengkap (" + bytes.length +
        " byte), tetapi pemeriksaan marker PDF gagal: " +
        "startxref=" + (transportCheck.startxref ? "OK" : "GAGAL") +
        ", %%EOF=" + (transportCheck.eof ? "OK" : "GAGAL") + "."
      );
    }

    if (payload.expectedSize && bytes.length !== payload.expectedSize) {
      throw new Error(
        "Ukuran PDF berubah saat diterima browser: backend " +
        payload.expectedSize + " byte, frontend " + bytes.length + " byte."
      );
    }

    const blob = new Blob([bytes], { type: "application/pdf" });
    downloadBlob(blob, payload.filename);
    setPdfLoading(false, "PDF selesai", "Laporan Detail PDF 6D.2 selesai dibuat dan diunduh.");
    showToast("Laporan Detail PDF 6D.2 selesai dibuat.");
  } catch (error) {
    setPdfLoading(false, "PDF gagal", "Laporan Detail PDF 6D.2 gagal dibuat.");
    showToast("Gagal membuat PDF 6D.2: " + (error.message || "Unknown error"), true);
  }
}

async function generatePdf(loader, label) {
  setPdfLoading(true, "Membuat " + label + "...", "PDF sedang dibuat. Mohon tunggu.");
  try {
    const data = await loader();
    const payload = extractPdfPayload(data);

    if (!payload.base64) {
      throw new Error("Backend tidak mengembalikan pdf_base64.");
    }

    const blob = base64ToBlob(payload.base64, "application/pdf");

    if (!(blob instanceof Blob) || blob.size < 100) {
      throw new Error("PDF yang diterima kosong atau tidak valid.");
    }

    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank", "noopener,noreferrer");

    if (!opened) {
      downloadBlob(blob, payload.filename);
      showToast(label + " selesai dibuat. Popup diblokir, file diunduh.");
    } else {
      showToast(label + " selesai dibuat.");
      setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
    }

    setPdfLoading(false, "PDF selesai", label + " selesai dibuat.");
  } catch (error) {
    setPdfLoading(false, "PDF gagal", label + " gagal dibuat.");
    showToast("Gagal membuat PDF: " + (error.message || "Unknown error"), true);
  }
}

function extractPdfPayload(data) {
  const source = data?.data && typeof data.data === "object" ? data.data : data;
  const base64 = source?.pdf_base64 || "";
  const filename = source?.filename || "dokumen.pdf";
  const rawSize = source?.size_bytes ?? source?.size ?? source?.pdf_size ?? null;
  const expectedSize = Number(rawSize);
  console.info("[PDF] payload received", {
    filename,
    base64Length: base64.length,
    expectedSize: Number.isFinite(expectedSize) && expectedSize > 0 ? expectedSize : null
  });
  return {
    base64,
    filename,
    expectedSize: Number.isFinite(expectedSize) && expectedSize > 0 ? expectedSize : null
  };
}

function base64ToBytes(base64) {
  const clean = String(base64)
    .replace(/^data:.*?;base64,/, "")
    .replace(/\s+/g, "");

  if (!clean) {
    throw new Error("pdf_base64 kosong.");
  }

  let binary;
  try {
    binary = atob(clean);
  } catch (error) {
    throw new Error("pdf_base64 tidak dapat didekode: " + (error.message || "base64 invalid"));
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64ToBlob(base64, mime) {
  return new Blob([base64ToBytes(base64)], { type: mime });
}

function containsAscii(bytes, text) {
  const target = new TextEncoder().encode(text);
  if (!target.length || target.length > bytes.length) return false;

  outer:
  for (let i = 0; i <= bytes.length - target.length; i++) {
    for (let j = 0; j < target.length; j++) {
      if (bytes[i + j] !== target[j]) continue outer;
    }
    return true;
  }
  return false;
}

function validatePdfBytes(bytes) {
  const header = bytes.length >= 5 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 &&
    bytes[2] === 0x44 && bytes[3] === 0x46 &&
    bytes[4] === 0x2D;

  const tailStart = Math.max(0, bytes.length - 4096);
  const tail = bytes.subarray(tailStart);

  return {
    header,
    startxref: containsAscii(tail, "startxref"),
    eof: containsAscii(tail, "%%EOF")
  };
}

function setPdfLoading(active, title = "Membuat PDF...", message = "PDF sedang dibuat. Mohon tunggu.") {
  let overlay = document.querySelector("#pdf-loading-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "pdf-loading-overlay";
    overlay.innerHTML =
      '<div class="pdf-loading-card" role="status" aria-live="polite">' +
        '<div id="pdf-loading-spinner" class="pdf-loading-spinner" aria-hidden="true"></div>' +
        '<div id="pdf-loading-title" class="pdf-loading-title"></div>' +
        '<div id="pdf-loading-message" class="pdf-loading-message"></div>' +
      '</div>';
    overlay.style.cssText = "position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.42);backdrop-filter:blur(2px);padding:20px;";
    document.body.appendChild(overlay);
    const style = document.createElement("style");
    style.id = "pdf-loading-style";
    style.textContent =
      "#pdf-loading-overlay .pdf-loading-card{min-width:280px;max-width:420px;padding:28px 30px;border-radius:16px;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.2);text-align:center;font-family:system-ui,sans-serif}" +
      "#pdf-loading-overlay .pdf-loading-spinner{width:42px;height:42px;margin:0 auto 16px;border:4px solid #e5e7eb;border-top-color:#2563eb;border-radius:50%;animation:pdfLoadingSpin .8s linear infinite}" +
      "#pdf-loading-overlay .pdf-loading-title{font-size:17px;font-weight:700;color:#172033}" +
      "#pdf-loading-overlay .pdf-loading-message{margin-top:7px;font-size:13px;color:#667085}" +
      "@keyframes pdfLoadingSpin{to{transform:rotate(360deg)}}" +
      "#pdf-loading-overlay.pdf-done .pdf-loading-spinner{border:0;width:42px;height:42px;background:#16a34a;border-radius:50%;position:relative;animation:none}" +
      "#pdf-loading-overlay.pdf-done .pdf-loading-spinner:after{content:'✓';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:25px;font-weight:700}" +
      "#pdf-loading-overlay.pdf-error .pdf-loading-spinner{border:0;width:42px;height:42px;background:#dc2626;border-radius:50%;position:relative;animation:none}" +
      "#pdf-loading-overlay.pdf-error .pdf-loading-spinner:after{content:'!';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:25px;font-weight:700}";
    document.head.appendChild(style);
  }
  const spinner = overlay.querySelector("#pdf-loading-spinner");
  overlay.querySelector("#pdf-loading-title").textContent = title;
  overlay.querySelector("#pdf-loading-message").textContent = message;
  overlay.classList.remove("pdf-done", "pdf-error");
  if (active) {
    overlay.style.display = "flex";
    spinner.style.display = "block";
    return;
  }
  overlay.classList.add(/gagal/i.test(title) ? "pdf-error" : "pdf-done");
  overlay.style.display = "flex";
  spinner.style.display = "block";
  setTimeout(() => { overlay.style.display = "none"; }, 1400);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openWhatsAppPicker(type, code, name) {
  // WhatsApp Share hanya mengirim pesan teks.
  // Tidak membuat, mengunduh, atau melampirkan PDF.
  const message = buildWhatsAppMessage(type, code, name);
  openWhatsApp("", message);
}

function buildWhatsAppMessage(type, code, name) {
  const customerName = name || "Bapak/Ibu";

  if (type === "customer") {
    const row = state.detailRow || {};
    const total = money(
      customerValue(
        state.detailData,
        row,
        ["total_piutang", "saldo_hutang", "total_outstanding"],
        row.total_piutang
      )
    );

    return [
      "Halo Bapak/Ibu *" + customerName + "*",
      "",
      "Kami dari *TB NUSANTARA* ingin menginformasikan posisi piutang berdasarkan data kami.",
      "",
      "*KODE PELANGGAN: " + code + "*",
      "",
      "*SALDO TABUNGAN: " + formatMoney(state.tabungan) + "*",
      "",
      "*TOTAL NOTA PIUTANG: " + formatMoney(total) + "*",
      "",
      "*Pembayaran dapat dilakukan melalui transfer:*",
      "",
      "*BRI*",
      "a.n. Wasimun",
      "No. Rekening: 003201105050505",
      "",
      "Mohon dapat melakukan pengecekan. Apabila pembayaran sudah dilakukan, silakan informasikan kepada kami.",
      "",
      "Terima kasih atas perhatian dan kerja samanya.",
      "",
      "*TB NUSANTARA*"
    ].join("\n");
  }

  if (type === "invoice") {
    const tx = (extractTransactions(state.detailData) || []).find((item) => {
      const invoiceCode = item?.kode_transaksi || item?.kode || "";
      return String(invoiceCode) === String(code);
    }) || {};

    const totalInvoice = money(
      tx.jumlah ??
      tx.total_invoice ??
      tx.total ??
      tx.total_nota ??
      tx.nilai_invoice ??
      0
    );

    const saldoHutang = money(
      tx.piutang ??
      tx.saldo_hutang ??
      tx.saldo ??
      0
    );

    const sudahDibayar = Math.max(0, totalInvoice - saldoHutang);
    const tanggal = tx.tanggal || "—";
    const jatuhTempo = tx.jatuh_tempo || tx.jatuhTempo || "—";

    return [
      "Halo Bapak/Ibu *" + customerName + "*",
      "",
      "Berikut informasi nota yang dimaksud dari *TB NUSANTARA*.",
      "",
      "*NO. NOTA: " + code + "*",
      "Tanggal: " + tanggal,
      "Jatuh Tempo: " + jatuhTempo,
      "",
      "*TOTAL INVOICE: " + formatMoney(totalInvoice) + "*",
      "*SUDAH DIBAYAR: " + formatMoney(sudahDibayar) + "*",
      "*SALDO HUTANG: " + formatMoney(saldoHutang) + "*",
      "",
      "Apabila pembayaran atas nota tersebut sudah dilakukan, silakan informasikan kepada kami.",
      "",
      "Terima kasih atas perhatian dan kerja samanya.",
      "",
      "*TB NUSANTARA*"
    ].join("\n");
  }

  return [
    "Halo Bapak/Ibu *" + customerName + "*",
    "",
    "Kami dari *TB NUSANTARA* ingin menginformasikan invoice *" + code + "*.",
    "",
    "Mohon dapat melakukan pengecekan.",
    "",
    "Terima kasih atas perhatian dan kerja samanya.",
    "",
    "*TB NUSANTARA*"
  ].join("\n");
}

function openWhatsApp(phone, message) {
  const base = phone
    ? "https://wa.me/" + phone
    : "https://api.whatsapp.com/send/";
  const separator = base.includes("?") ? "&" : "?";
  const url = base + separator + "text=" + encodeURIComponent(message);
  window.open(url, "_blank", "noopener,noreferrer");
}

function actionModalClick(e) {
  if (e.target.matches("[data-close-action]")) closeActionModal();
}

function closeActionModal() {
  const modal = document.querySelector("#action-modal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
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

function showToast(message, isError = false) {
  let toast = document.querySelector("#app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast";
    document.body.appendChild(toast);
  }
  toast.className = "app-toast " + (isError ? "error" : "");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3500);
}
