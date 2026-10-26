import { api } from "../api/endpoints.js?v=20261026-customer-savings-v1";

const CACHE_KEY = "sidretail:customer:v1";
const CACHE_TTL_MS = 2 * 60 * 1000;
const state = {
  rows: [],
  filtered: [],
  page: 1,
  pageSize: 25,
  search: "",
  loadedAt: 0,
  loading: false,
  mountId: 0,
  detailRequestId: 0,
  escapeHandler: null,
  lastFocus: null
};

const root = () => document.querySelector("#page-content");
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const countFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const amount = (value) => {
  const n = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const money = (value) => rupiah.format(amount(value));
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const codeOf = (row) => String(row?.kode_pelanggan ?? row?.kode ?? row?.kd_pelanggan ?? "");
const nameOf = (row) => String(row?.nama ?? row?.nama_pelanggan ?? row?.nm_pelanggan ?? "Tanpa nama");
const balanceOf = (row) => amount(row?.saldo_tabungan);
const getRows = (result) => {
  const candidates = [
    result, result?.data, result?.rows, result?.customers, result?.pelanggan,
    result?.data?.rows, result?.data?.customers, result?.data?.pelanggan
  ];
  return candidates.find(Array.isArray) || null;
};
const isMounted = (id) => id === state.mountId && Boolean(document.querySelector("#savings-page"));
const readCache = () => {
  try {
    const value = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
    const rows = getRows(value?.result);
    const savedAt = Number(value?.savedAt);
    return rows && Number.isFinite(savedAt) && savedAt > 0 ? { rows, savedAt } : null;
  } catch (error) {
    console.warn("[SAVINGS CACHE] read failed:", error);
    return null;
  }
};
const writeCache = (result, savedAt = Date.now()) => {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ version: 1, savedAt, result })); }
  catch (error) { console.warn("[SAVINGS CACHE] write failed:", error); }
};

export function renderTabunganPelangganPage() {
  const mountId = ++state.mountId;
  state.rows = [];
  state.filtered = [];
  state.page = 1;
  state.search = "";
  state.loading = false;
  state.loadedAt = 0;

  root().innerHTML = `
    <section class="page-heading savings-heading" id="savings-page">
      <div><p class="eyebrow">Keuangan Pelanggan</p><h2>Tabungan Pelanggan</h2>
        <p class="page-description">Pelanggan dengan saldo tabungan positif, terlepas dari status piutangnya.</p></div>
      <button id="savings-refresh" class="btn btn-primary" type="button">↻ Refresh</button>
    </section>
    <section class="summary-grid savings-summary" aria-label="Ringkasan tabungan">
      <article class="summary-card"><span>Total Saldo Tabungan</span><strong id="savings-total">Rp0</strong><small>seluruh pelanggan bersaldo positif</small></article>
      <article class="summary-card"><span>Pelanggan Menabung</span><strong id="savings-count">0</strong><small>pelanggan dengan saldo di atas Rp0</small></article>
      <article class="summary-card"><span>Status Data</span><strong id="savings-status">Memuat</strong><small id="savings-updated">Mengambil data terbaru</small></article>
    </section>
    <section class="card panel savings-panel">
      <div class="toolbar savings-toolbar">
        <label class="search-box" for="savings-search"><span aria-hidden="true">⌕</span><input id="savings-search" type="search" placeholder="Cari kode, nama, atau alamat..." autocomplete="off"></label>
        <label class="page-size" for="savings-page-size"><span>Baris</span><select id="savings-page-size"><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>
      </div>
      <div id="savings-state" class="table-state loading" role="status">Memuat data tabungan...</div>
      <div id="savings-table-wrap" class="table-scroll hidden"><table class="data-table savings-table">
        <thead><tr><th>Kode</th><th>Nama</th><th>Alamat</th><th class="savings-amount">Saldo Tabungan</th><th>Detail</th></tr></thead>
        <tbody id="savings-body"></tbody>
      </table></div>
      <div id="savings-cards" class="mobile-data-cards hidden"></div>
      <div id="savings-pagination" class="pagination hidden"><button id="savings-prev" class="btn btn-light" type="button">← Sebelumnya</button><span id="savings-page-info">Halaman 1 / 1</span><button id="savings-next" class="btn btn-light" type="button">Berikutnya →</button></div>
    </section>
    <div id="savings-modal" class="modal hidden" aria-hidden="true">
      <div class="modal-backdrop" data-savings-close></div>
      <section class="modal-panel savings-modal-panel" role="dialog" aria-modal="true" aria-labelledby="savings-detail-title">
        <div class="modal-header"><div><p class="eyebrow">Riwayat Tabungan</p><h3 id="savings-detail-title">Pelanggan</h3><span id="savings-detail-code" class="modal-code"></span></div>
          <button id="savings-detail-close" class="modal-close" type="button" aria-label="Tutup">×</button></div>
        <div id="savings-detail-content" class="modal-body"></div>
      </section>
    </div>`;

  bindEvents(mountId);
  const cached = readCache();
  if (cached) {
    applyRows(cached.rows, cached.savedAt);
    setFreshness(cached.savedAt, cached.savedAt + CACHE_TTL_MS > Date.now() ? "Data tersimpan" : "Data cache");
  } else {
    setState("loading", "Memuat data tabungan...");
  }
  loadData(mountId, Boolean(cached));
}

function bindEvents(mountId) {
  document.querySelector("#savings-refresh").addEventListener("click", () => loadData(mountId, true));
  document.querySelector("#savings-search").addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLocaleLowerCase("id-ID");
    state.page = 1;
    filterAndRender();
  });
  document.querySelector("#savings-page-size").addEventListener("change", (event) => {
    state.pageSize = Number(event.target.value) || 25;
    state.page = 1;
    renderRows();
  });
  document.querySelector("#savings-prev").addEventListener("click", () => {
    if (state.page > 1) { state.page--; renderRows(); }
  });
  document.querySelector("#savings-next").addEventListener("click", () => {
    if (state.page < pagesTotal()) { state.page++; renderRows(); }
  });
  document.querySelector("#savings-body").addEventListener("click", onDetailClick);
  document.querySelector("#savings-cards").addEventListener("click", onDetailClick);
  document.querySelector("#savings-detail-close").addEventListener("click", closeDetail);
  document.querySelector("#savings-modal").addEventListener("click", (event) => {
    if (event.target.closest("[data-savings-close]")) closeDetail();
  });
  if (state.escapeHandler) document.removeEventListener("keydown", state.escapeHandler);
  state.escapeHandler = (event) => {
    if (event.key === "Escape" && !document.querySelector("#savings-modal")?.classList.contains("hidden")) closeDetail();
  };
  document.addEventListener("keydown", state.escapeHandler);
}

async function loadData(mountId, showStale) {
  if (!isMounted(mountId) || state.loading) return;
  state.loading = true;
  const button = document.querySelector("#savings-refresh");
  button.disabled = true;
  button.textContent = "↻ Memuat...";
  if (!state.rows.length) setState("loading", "Memuat data tabungan...");
  else setFreshness(state.loadedAt, "Memperbarui data…");

  try {
    const result = await api.pelanggan();
    if (!isMounted(mountId)) return;
    const rows = getRows(result);
    if (!rows) throw new Error("Format data pelanggan tidak dikenali.");
    writeCache(result);
    applyRows(rows, Date.now());
    setFreshness(Date.now(), "Baru saja diperbarui");
  } catch (error) {
    if (!isMounted(mountId)) return;
    console.error("[SAVINGS] load failed:", error);
    if (state.rows.length && showStale) {
      setFreshness(state.loadedAt, "Pembaruan gagal · menampilkan data tersimpan");
    } else {
      setState("error", "Data tabungan gagal dimuat. " + (error?.message || "Periksa koneksi API."));
      setFreshness(0, "Belum tersedia");
    }
  } finally {
    if (isMounted(mountId)) {
      state.loading = false;
      button.disabled = false;
      button.textContent = "↻ Refresh";
    }
  }
}

function applyRows(rows, savedAt) {
  state.rows = rows.filter((row) => balanceOf(row) > 0);
  state.loadedAt = Number(savedAt) || Date.now();
  updateSummary();
  filterAndRender();
  if (state.rows.length) {
    document.querySelector("#savings-state").classList.add("hidden");
  } else {
    setState("empty", "Belum ada pelanggan dengan saldo tabungan positif.");
  }
}

function updateSummary() {
  const total = state.rows.reduce((sum, row) => sum + balanceOf(row), 0);
  document.querySelector("#savings-total").textContent = money(total);
  document.querySelector("#savings-count").textContent = countFormat.format(state.rows.length);
}
function setFreshness(timestamp, label) {
  const status = document.querySelector("#savings-status");
  const updated = document.querySelector("#savings-updated");
  if (!status || !updated) return;
  status.textContent = label.includes("gagal") ? "Cache" : "Siap";
  updated.textContent = timestamp ? `${label} · ${new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp))}` : label;
}
function setState(kind, message) {
  const el = document.querySelector("#savings-state");
  if (!el) return;
  el.className = `table-state ${kind}`;
  el.textContent = message;
  document.querySelector("#savings-table-wrap")?.classList.add("hidden");
  document.querySelector("#savings-cards")?.classList.add("hidden");
  document.querySelector("#savings-pagination")?.classList.add("hidden");
}
function filterAndRender() {
  const q = state.search;
  state.filtered = state.rows.filter((row) => !q || [codeOf(row), nameOf(row), row?.alamat].some((v) => String(v || "").toLocaleLowerCase("id-ID").includes(q)));
  state.page = Math.min(state.page, pagesTotal()) || 1;
  renderRows();
}
function pagesTotal() { return Math.max(1, Math.ceil(state.filtered.length / state.pageSize)); }
function renderRows() {
  if (!document.querySelector("#savings-page")) return;
  const from = (state.page - 1) * state.pageSize;
  const rows = state.filtered.slice(from, from + state.pageSize);
  const body = document.querySelector("#savings-body");
  const cards = document.querySelector("#savings-cards");
  body.innerHTML = rows.map((row) => rowHtml(row, false)).join("");
  cards.innerHTML = rows.map((row) => rowHtml(row, true)).join("");
  const hasRows = rows.length > 0;
  document.querySelector("#savings-table-wrap").classList.toggle("hidden", !hasRows);
  cards.classList.toggle("hidden", !hasRows);
  document.querySelector("#savings-state").classList.toggle("hidden", hasRows);
  if (!hasRows) {
    document.querySelector("#savings-state").className = "table-state empty";
    document.querySelector("#savings-state").textContent = state.rows.length ? "Tidak ada hasil yang cocok dengan pencarian." : "Belum ada pelanggan dengan saldo tabungan positif.";
  }
  const pagination = document.querySelector("#savings-pagination");
  pagination.classList.toggle("hidden", !hasRows);
  document.querySelector("#savings-page-info").textContent = `Menampilkan ${from + 1}–${Math.min(from + rows.length, state.filtered.length)} dari ${countFormat.format(state.filtered.length)} pelanggan`;
  document.querySelector("#savings-prev").disabled = state.page <= 1;
  document.querySelector("#savings-next").disabled = state.page >= pagesTotal();
}
function rowHtml(row, card) {
  const code = codeOf(row), name = nameOf(row), address = String(row?.alamat || "—");
  const detail = `<button class="btn btn-light savings-detail-button" type="button" data-savings-code="${escapeHtml(code)}" aria-label="Lihat riwayat tabungan ${escapeHtml(name)}">Detail</button>`;
  if (card) return `<article class="data-card savings-data-card"><div class="data-card-heading"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(code)}</span></div><dl><div><dt>Alamat</dt><dd>${escapeHtml(address)}</dd></div><div><dt>Saldo Tabungan</dt><dd class="savings-card-amount">${escapeHtml(money(balanceOf(row)))}</dd></div></dl>${detail}</article>`;
  return `<tr><td>${escapeHtml(code)}</td><td><strong>${escapeHtml(name)}</strong></td><td>${escapeHtml(address)}</td><td class="savings-amount">${escapeHtml(money(balanceOf(row)))}</td><td>${detail}</td></tr>`;
}

async function onDetailClick(event) {
  const button = event.target.closest("[data-savings-code]");
  if (!button) return;
  const row = state.rows.find((item) => codeOf(item) === button.dataset.savingsCode);
  if (row) await openDetail(row);
}
async function openDetail(row) {
  const modal = document.querySelector("#savings-modal");
  const content = document.querySelector("#savings-detail-content");
  const title = document.querySelector("#savings-detail-title");
  const code = codeOf(row);
  const requestId = ++state.detailRequestId;
  state.lastFocus = document.activeElement;
  title.textContent = nameOf(row);
  document.querySelector("#savings-detail-code").textContent = code;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.querySelector("#savings-detail-close").focus();
  content.innerHTML = '<div class="table-state loading">Memuat riwayat tabungan...</div>';
  try {
    const result = await api.pelangganTabunganHistory(code, 500);
    if (requestId !== state.detailRequestId || !document.querySelector("#savings-modal")) return;
    const history = result?.data;
    if (!Array.isArray(history)) throw new Error("Format riwayat tabungan tidak dikenali.");
    const summary = result?.summary || {};
    const master = amount(summary.saldo_master ?? result?.customer?.saldo_tabungan ?? row.saldo_tabungan);
    const reconstructed = Number(summary.saldo_rekonstruksi_history);
    const difference = Number(summary.selisih_rekonstruksi_vs_master);
    content.innerHTML = `
      <div class="savings-detail-summary">
        <article><span>Saldo Saat Ini</span><strong>${escapeHtml(money(master))}</strong></article>
        <article><span>Transaksi Ditampilkan</span><strong>${countFormat.format(history.length)}${history.length >= 500 ? "+" : ""}</strong></article>
      </div>
      ${Number.isFinite(reconstructed) && Number.isFinite(difference) && Math.abs(difference) > 0.5 ? `<p class="savings-reconciliation" role="status">Rekonstruksi dari riwayat yang dikembalikan API berbeda ${escapeHtml(money(Math.abs(difference)))} dari saldo master. Riwayat dibatasi maksimum 500 transaksi; gunakan saldo master sebagai saldo saat ini.</p>` : ""}
      <p class="savings-history-note">Riwayat bersifat baca saja. API mengembalikan paling banyak 500 transaksi tertua untuk pelanggan ini.</p>
      <div class="savings-history-table-wrap"><table class="data-table savings-history-table"><thead><tr><th>Tanggal</th><th>Jam</th><th>Jenis</th><th>Keterangan</th><th>Jumlah</th><th>Saldo Berjalan</th></tr></thead><tbody>${history.length ? history.map(historyRow).join("") : '<tr><td colspan="6" class="savings-no-history">Belum ada riwayat transaksi yang dikembalikan.</td></tr>'}</tbody></table></div>
      ${history.length ? `<div class="savings-history-cards">${history.map(historyCard).join("")}</div>` : ""}
    `;
  } catch (error) {
    if (requestId !== state.detailRequestId) return;
    content.innerHTML = `<div class="table-state error">${escapeHtml(error?.message || "Riwayat tabungan gagal dimuat.")}</div>`;
  }
}
function historyRow(item) {
  const type = String(item?.jenis || "—").toUpperCase();
  const raw = amount(item?.jumlah);
  const negative = ["AMBIL", "TARIKAN", "PENARIKAN", "PENGAMBILAN"].includes(type);
  const signed = negative ? -raw : raw;
  return `<tr><td>${escapeHtml(item?.tanggal || "—")}</td><td>${escapeHtml(item?.jam || "—")}</td><td>${escapeHtml(type)}</td><td>${escapeHtml(item?.keterangan || "—")}</td><td class="savings-amount ${signed < 0 ? "is-withdrawal" : "is-deposit"}">${signed < 0 ? "−" : "+"}${escapeHtml(money(Math.abs(signed)))}</td><td class="savings-amount">${escapeHtml(item?.running_balance == null ? "—" : money(item.running_balance))}</td></tr>`;
}
function historyCard(item) {
  const type = String(item?.jenis || "—").toUpperCase();
  const raw = amount(item?.jumlah);
  const negative = ["AMBIL", "TARIKAN", "PENARIKAN", "PENGAMBILAN"].includes(type);
  const signed = negative ? -raw : raw;
  return `<article class="savings-history-card"><div><strong>${escapeHtml(item?.tanggal || "—")}</strong><span>${escapeHtml(item?.jam || "")}</span></div><p>${escapeHtml(type)} · ${escapeHtml(item?.keterangan || "Tanpa keterangan")}</p><strong class="${signed < 0 ? "is-withdrawal" : "is-deposit"}">${signed < 0 ? "−" : "+"}${escapeHtml(money(Math.abs(signed)))}</strong><small>Saldo berjalan: ${escapeHtml(item?.running_balance == null ? "—" : money(item.running_balance))}</small></article>`;
}
function closeDetail() {
  const modal = document.querySelector("#savings-modal");
  if (!modal) return;
  state.detailRequestId++;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  state.lastFocus?.focus?.();
}

function setFreshness(timestamp, label) {
  const status = document.querySelector("#savings-status");
  const updated = document.querySelector("#savings-updated");
  if (!status || !updated) return;
  status.textContent = label.includes("gagal") ? "Cache" : "Siap";
  updated.textContent = timestamp ? `${label} · ${new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp))}` : label;
}
