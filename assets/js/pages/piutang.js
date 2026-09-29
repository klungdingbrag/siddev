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
    '<div id="piutang-modal" class="modal hidden" aria-hidden="true"><div class="modal-backdrop" data-close-detail></div><section class="modal-panel modal-panel-detail" role="dialog" aria-modal="true"><div class="modal-header"><div><p class="eyebrow">Detail</p><h3 id="detail-title">Detail</h3><span id="detail-code" class="modal-code"></span></div><button id="detail-close" class="modal-close" aria-label="Tutup">×</button></div><div id="detail-content" class="modal-body"></div><div id="detail-footer" class="detail-footer hidden"></div></section></div>' +
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
    if (e.target.matches("[data-close-detail]")) closeDetail();
    const btn = e.target.closest("[data-pdf-action]");
    if (btn) handlePdfAction(btn.dataset.pdfAction, btn.dataset.code);
    const wa = e.target.closest("[data-wa-action]");
    if (wa) openWhatsAppPicker(wa.dataset.waAction, wa.dataset.code, wa.dataset.name || "");
  });
  document.querySelector("#action-close").addEventListener("click", closeActionModal);
  document.querySelector("#action-modal").addEventListener("click", actionModalClick);
}

async function loadPiutang(force = false) {
  if (state.loading || (state.loaded && !force)) return;
  state.loading = true;
  setState("loading", "Mengambil data piutang dari Development backend...");
  try {
    const result = await api.piutang();
    state.rows = Array.isArray(result?.data)
      ? result.data.filter(r => money(r.total_piutang) > 0)
      : Array.isArray(result)
        ? result.filter(r => money(r.total_piutang) > 0)
        : [];
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
  document.querySelector("#detail-title").textContent = "Detail";
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
      '<button class="btn btn-light" data-pdf-action="summary" data-code="' + esc(state.detailCode) + '">▣ Ringkasan PDF</button>' +
      '<button class="btn btn-light" data-pdf-action="detail" data-code="' + esc(state.detailCode) + '">▤ Laporan Detail PDF</button>' +
    '</div>' +
    '<div class="detail-footer-right">' +
      '<button class="btn btn-light" id="detail-footer-close">Tutup</button>' +
      '<button class="btn btn-whatsapp" data-wa-action="customer" data-code="' + esc(state.detailCode) + '" data-name="' + esc(name) + '">▣ Share WhatsApp</button>' +
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
      '<button class="mini-action" data-pdf-action="invoice" data-code="' + esc(code) + '" title="Buka PDF Invoice">▣ PDF</button>' +
      '<button class="mini-action whatsapp-mini" data-wa-action="invoice" data-code="' + esc(code) + '" data-name="' + esc(name) + '" title="Bagikan Invoice ke WhatsApp">▢ WhatsApp</button>' +
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
    await generatePdf(
      (attempt) => api.pdfSemuaDetailPiutang6D2(
        code,
        attempt > 0 ? { _pdf_retry: Date.now() } : {}
      ),
      "Laporan Detail Piutang PDF",
      { retry: 2, validatePdf: true, requireBackendSize: true }
    );
  }
}

async function generatePdf(loader, label, options = {}) {
  const retryCount = Number(options.retry || 0);
  const validatePdf = options.validatePdf !== false;
  const requireBackendSize = options.requireBackendSize === true;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      showToast(
        attempt === 0
          ? "Membuat " + label + "..."
          : "PDF terdeteksi tidak lengkap. Mencoba ulang " + attempt + "/" + retryCount + "..."
      );

      const data = await loader(attempt);
      const payload = extractPdfPayload(data);

      if (!payload.base64) {
        throw new Error("Backend tidak mengembalikan pdf_base64.");
      }

      const blob = base64ToBlob(payload.base64, "application/pdf");
      const validation = validatePdf
        ? await validatePdfBlob(blob, payload.expectedSize, requireBackendSize)
        : { valid: true, size: blob.size };

      if (!validation.valid) {
        throw new Error("PDF tidak lengkap: " + validation.reason);
      }

      const diagnostics =
        "size=" + validation.size +
        (validation.expectedSize ? "/" + validation.expectedSize : "") +
        ", EOF=" + (validation.hasEof ? "OK" : "NO");

      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank", "noopener,noreferrer");

      if (!opened) {
        downloadBlob(blob, payload.filename);
        showToast("PDF valid (" + diagnostics + "). Popup diblokir, file diunduh.");
      } else {
        showToast("PDF valid (" + diagnostics + "). Dibuka di tab baru.");
        setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
      }
      return;
    } catch (error) {
      if (attempt >= retryCount) {
        showToast("Gagal membuat PDF: " + (error.message || "Unknown error"), true);
      }
    }
  }
}

function extractPdfPayload(data) {
  const source = data?.data && typeof data.data === "object" ? data.data : data;
  const base64 = source?.pdf_base64 || "";
  const filename = source?.filename || "dokumen.pdf";
  const rawSize =
    source?.size_bytes ??
    source?.size ??
    source?.pdf_size ??
    null;
  const expectedSize = Number(rawSize);

  return {
    base64,
    filename,
    expectedSize: Number.isFinite(expectedSize) && expectedSize > 0
      ? expectedSize
      : null
  };
}

async function validatePdfBlob(blob, expectedSize = null, requireExpectedSize = false) {
  if (!(blob instanceof Blob) || blob.size < 100) {
    return {
      valid: false,
      size: blob?.size || 0,
      hasEof: false,
      reason: "ukuran file tidak valid (" + (blob?.size || 0) + " byte)"
    };
  }

  if (requireExpectedSize && expectedSize && blob.size !== expectedSize) {
    return {
      valid: false,
      size: blob.size,
      expectedSize,
      hasEof: false,
      reason: "ukuran hasil decoding " + blob.size + " byte, backend melaporkan " + expectedSize + " byte"
    };
  }

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const header = new TextDecoder("latin1").decode(bytes.slice(0, 8));

  if (!header.startsWith("%PDF-")) {
    return {
      valid: false,
      size: bytes.length,
      expectedSize,
      hasEof: false,
      reason: "header %PDF tidak ditemukan"
    };
  }

  const tailStart = Math.max(0, bytes.length - 2048);
  const tail = new TextDecoder("latin1").decode(bytes.slice(tailStart));
  const hasEof = /%%EOF\s*$/.test(tail);
  const hasStartXref = /startxref\s+\d+\s+%%EOF\s*$/.test(tail);

  if (!hasEof) {
    return {
      valid: false,
      size: bytes.length,
      expectedSize,
      hasEof,
      reason: "penanda %%EOF tidak ditemukan di akhir file"
    };
  }

  if (!hasStartXref) {
    return {
      valid: false,
      size: bytes.length,
      expectedSize,
      hasEof,
      reason: "struktur startxref/%%EOF tidak lengkap"
    };
  }

  return {
    valid: true,
    size: bytes.length,
    expectedSize,
    hasEof: true
  };
}

function base64ToBlob(base64, mime) {
  const clean = String(base64)
    .replace(/^data:.*?;base64,/, "")
    .replace(/\s+/g, "");

  let binary;
  try {
    binary = atob(clean);
  } catch (error) {
    throw new Error("pdf_base64 tidak dapat didekode: " + (error.message || "base64 invalid"));
  }

  const chunkSize = 1024 * 64;
  const parts = [];
  for (let i = 0; i < binary.length; i += chunkSize) {
    const chunk = binary.slice(i, i + chunkSize);
    const bytes = new Uint8Array(chunk.length);
    for (let j = 0; j < chunk.length; j++) bytes[j] = binary.charCodeAt(j);
    parts.push(bytes);
  }
  return new Blob(parts, { type: mime });
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
  const modal = document.querySelector("#action-modal");
  const title = type === "invoice" ? "Bagikan Invoice ke WhatsApp" : "Bagikan Laporan ke WhatsApp";
  const customerPhone = state.detailData
    ? customerValue(state.detailData, state.detailRow, ["telp", "telepon", "no_wa", "nomor_wa", "whatsapp"], "")
    : "";

  const documentOptions = type === "invoice"
    ? '<option value="invoice">PDF Invoice</option>'
    : '<option value="summary">Ringkasan Piutang PDF</option><option value="detail">Laporan Detail Piutang PDF</option><option value="none">Tanpa PDF</option>';

  document.querySelector("#action-content").innerHTML =
    '<div class="contact-picker">' +
      '<p class="contact-description">' + esc(title) + '</p>' +
      '<label class="field-label">Dokumen yang dibagikan</label>' +
      '<select id="wa-document" class="contact-input">' + documentOptions + '</select>' +
      '<div class="contact-actions">' +
        '<button id="contact-whatsapp" class="btn btn-light">▣ Pilih Kontak di WhatsApp</button>' +
        '<button id="contact-device" class="btn btn-light">▣ Kontak Perangkat</button>' +
      '</div>' +
      '<label class="field-label">Nomor tujuan (opsional)</label>' +
      '<input id="wa-number" class="contact-input" type="tel" inputmode="tel" placeholder="Kosongkan untuk memilih kontak di WhatsApp" value="' + esc(customerPhone) + '">' +
      '<small class="contact-hint">Jika nomor dikosongkan, WhatsApp akan membuka pilihan kontak. Jika nomor diisi, chat langsung dibuka ke nomor tersebut.</small>' +
      '<label class="field-label">Pesan</label>' +
      '<textarea id="wa-message" class="contact-message" rows="6">' + esc(buildWhatsAppMessage(type, code, name)) + '</textarea>' +
      '<div class="contact-footer">' +
        '<button id="wa-cancel" class="btn btn-light">Batal</button>' +
        '<button id="wa-send" class="btn btn-whatsapp">Bagikan</button>' +
      '</div>' +
    '</div>';

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");

  document.querySelector("#contact-whatsapp").addEventListener("click", async () => {
    const message = document.querySelector("#wa-message").value.trim();
    const phone = normalizePhone(document.querySelector("#wa-number").value);
    const documentType = document.querySelector("#wa-document").value;
    await sendWhatsAppShare(documentType, code, phone, message);
  });

  document.querySelector("#contact-device").addEventListener("click", selectDeviceContact);
  document.querySelector("#wa-cancel").addEventListener("click", closeActionModal);
  document.querySelector("#wa-send").addEventListener("click", async () => {
    const phone = normalizePhone(document.querySelector("#wa-number").value);
    const message = document.querySelector("#wa-message").value.trim();
    const documentType = document.querySelector("#wa-document").value;
    await sendWhatsAppShare(documentType, code, phone, message);
  });
}

async function sendWhatsAppShare(documentType, code, phone, message) {
  try {
    closeActionModal();

    if (documentType === "none") {
      openWhatsApp(phone, message);
      return;
    }

    showToast("Menyiapkan PDF untuk WhatsApp...");
    const loader = documentType === "invoice"
      ? () => api.pdfInvoice(code)
      : documentType === "summary"
        ? () => api.pdfRingkasanPiutang({ kode_pelanggan: code })
        : () => api.pdfSemuaDetailPiutang6D2(code);

    const data = await loader();
    const base64 = data?.pdf_base64 || data?.data?.pdf_base64;
    const filename = data?.filename || data?.data?.filename || "dokumen-piutang.pdf";
    if (!base64) throw new Error("Backend tidak mengembalikan PDF.");

    const blob = base64ToBlob(base64, "application/pdf");
    const file = new File([blob], filename, { type: "application/pdf" });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: filename,
        text: message,
        files: [file]
      });
      showToast("PDF siap dibagikan melalui menu share perangkat.");
      return;
    }

    downloadBlob(blob, filename);
    openWhatsApp(phone, message);
    showToast("PDF diunduh. WhatsApp dibuka; lampirkan PDF tersebut di chat.");
  } catch (error) {
    if (error?.name === "AbortError") return;
    showToast("Gagal membagikan PDF: " + (error.message || "Unknown error"), true);
  }
}

async function selectDeviceContact() {
  if (!("contacts" in navigator) || typeof navigator.contacts.select !== "function") {
    showToast("Pemilih kontak perangkat tidak didukung browser ini. Kosongkan nomor untuk memilih kontak langsung di WhatsApp.", true);
    return;
  }

  try {
    const contacts = await navigator.contacts.select(["name", "tel"], { multiple: false });
    const tel = contacts?.[0]?.tel?.[0];
    if (tel) document.querySelector("#wa-number").value = tel;
    else showToast("Kontak yang dipilih tidak memiliki nomor telepon.", true);
  } catch (error) {
    if (error?.name !== "AbortError") showToast("Kontak tidak dapat dipilih.", true);
  }
}

function normalizePhone(value) {
  let phone = String(value || "").replace(/[^0-9]/g, "");
  if (!phone) return "";
  if (phone.startsWith("0")) phone = "62" + phone.slice(1);
  return /^62\d{8,15}$/.test(phone) ? phone : "";
}

function buildWhatsAppMessage(type, code, name) {
  if (type === "invoice") {
    return "Halo, berikut invoice " + code + " untuk " + (name || "pelanggan") + ".";
  }
  return "Halo, berikut laporan piutang pelanggan " + (name || "pelanggan") + ".";
}

function openWhatsApp(phone, message) {
  const base = phone
    ? "https://wa.me/" + phone
    : "https://wa.me/";
  const url = base + "?text=" + encodeURIComponent(message);
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
