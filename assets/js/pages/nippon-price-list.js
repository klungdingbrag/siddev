const NIPPON_GAS_URL = "https://script.google.com/macros/s/AKfycbyaUscsruoi7X_uWF1P1-CIbZ27QFsSajqeFDHwcCAK578WJ32MI30Uujxtj9FYnqFf/exec";
const state = { products: [], filtered: [], search: "", editingId: "", escapeHandler: null, focusBeforeModal: null };
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const countFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const root = () => document.querySelector("#page-content");
const esc = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const fmtMoney = (value) => rupiah.format(Number(value) || 0);
function parseMoney(value) {
  const raw = String(value ?? "").trim().replace(/[^0-9,.-]/g, "");
  if (!raw) return 0;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : (/^-?\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw);
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}
function buildUrl(action, params = {}) {
  const url = new URL(NIPPON_GAS_URL);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  return url.toString();
}
async function request(action, params = {}, method = "GET", payload = {}) {
  const response = await fetch(buildUrl(action, params), {
    method,
    cache: "no-store",
    ...(method === "POST" ? {
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload })
    } : {})
  });
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); }
  catch { throw new Error("Respons GAS Price List bukan JSON valid."); }
  if (!response.ok || result?.success === false) throw new Error(result?.message || "Permintaan Price List gagal.");
  return result?.data;
}

export function renderNipponPriceListPage() {
  state.products = [];
  state.filtered = [];
  state.search = "";
  state.editingId = "";
  root().innerHTML = `
    <section id="nippon-price-page" class="page-heading nippon-heading">
      <div><p class="eyebrow">Pembelian Produk</p><h2>Price List Nippon Paint</h2>
        <p class="page-description">Daftar HPP dasar produk Nippon Paint. HPP warna dihitung dengan memasukkan biaya tinta secara manual.</p></div>
      <div class="nippon-heading-actions"><button id="nippon-refresh" class="btn btn-light" type="button">↻ Refresh</button><button id="nippon-add" class="btn btn-primary" type="button">＋ Tambah Produk</button></div>
    </section>
    <section class="summary-grid nippon-summary" aria-label="Ringkasan daftar Nippon Paint">
      <article class="summary-card"><span>Produk Terdaftar</span><strong id="nippon-count">0</strong><small>varian ukuran aktif</small></article>
      <article class="summary-card"><span>Status Data</span><strong id="nippon-status">Memuat</strong><small id="nippon-updated">Menghubungkan ke GAS Invoice</small></article>
    </section>
    <section class="card panel nippon-panel">
      <div class="toolbar nippon-toolbar">
        <label class="search-box" for="nippon-search"><span aria-hidden="true">⌕</span><input id="nippon-search" type="search" placeholder="Cari nama produk atau ukuran..." autocomplete="off"></label>
      </div>
      <div id="nippon-list-state" class="table-state loading" role="status">Memuat daftar harga...</div>
      <div id="nippon-table-wrap" class="table-scroll hidden"><table class="data-table nippon-table">
        <thead><tr><th>Nama Produk</th><th>Ukuran / Kemasan</th><th>HPP Dasar</th><th>Terakhir Diperbarui</th><th>Aksi</th></tr></thead>
        <tbody id="nippon-body"></tbody>
      </table></div>
    </section>
    <section class="card panel nippon-calculator" aria-labelledby="nippon-calc-title">
      <div class="nippon-section-heading"><div><p class="eyebrow">Perhitungan Manual</p><h3 id="nippon-calc-title">Hitung HPP Warna</h3><p>Masukkan biaya tinta untuk warna yang sedang dihitung. Biaya tinta tidak disimpan sebagai harga tetap.</p></div></div>
      <div class="nippon-calc-grid">
        <label class="nippon-field"><span>Produk dan ukuran</span><select id="nippon-calc-product"><option value="">Pilih produk</option></select></label>
        <label class="nippon-field"><span>Warna / kode warna</span><input id="nippon-calc-color" type="text" maxlength="120" placeholder="Contoh: warna khusus"></label>
        <label class="nippon-field"><span>Biaya tinta per kemasan (Rp)</span><input id="nippon-calc-ink" type="text" inputmode="numeric" value="0" placeholder="0"></label>
      </div>
      <div class="nippon-calc-result" aria-live="polite">
        <div><span>HPP Dasar</span><strong id="nippon-calc-base">Rp0</strong></div><span class="nippon-calc-plus">+</span>
        <div><span>Biaya Tinta</span><strong id="nippon-calc-ink-result">Rp0</strong></div><span class="nippon-calc-equals">=</span>
        <div class="nippon-calc-total"><span>Perkiraan HPP Warna</span><strong id="nippon-calc-total">Rp0</strong></div>
      </div>
      <p class="nippon-calc-note">Hasil ini adalah HPP per kemasan. Pastikan input biaya tinta sesuai ukuran produk yang dipilih.</p>
    </section>
    <div id="nippon-editor-modal" class="modal hidden" aria-hidden="true">
      <div class="modal-backdrop" data-nippon-close></div>
      <section class="modal-panel nippon-editor-panel" role="dialog" aria-modal="true" aria-labelledby="nippon-editor-title">
        <header class="modal-header"><div><p class="eyebrow">Data Produk Nippon Paint</p><h3 id="nippon-editor-title">Tambah Produk</h3></div>
          <button id="nippon-editor-close" class="modal-close" type="button" aria-label="Tutup">×</button></header>
        <form id="nippon-editor-form" class="modal-body nippon-editor-form">
          <label class="nippon-field"><span>Nama barang</span><input id="nippon-product-name" type="text" maxlength="180" required></label>
          <label class="nippon-field"><span>Ukuran / kemasan</span><input id="nippon-product-size" type="text" maxlength="80" placeholder="Contoh: 1 L, 5 kg, 20 L" required></label>
          <label class="nippon-field"><span>HPP dasar / harga pembelian (Rp)</span><input id="nippon-product-cost" type="text" inputmode="numeric" placeholder="Contoh: 125000" required></label>
          <p id="nippon-editor-error" class="nippon-form-error hidden" role="alert"></p>
          <footer class="nippon-form-actions"><button class="btn btn-light" type="button" data-nippon-close>Batal</button><button id="nippon-save" class="btn btn-primary" type="submit">Simpan Produk</button></footer>
        </form>
      </section>
    </div>`;
  bindEvents();
  loadProducts();
}

function bindEvents() {
  document.querySelector("#nippon-refresh").addEventListener("click", loadProducts);
  document.querySelector("#nippon-add").addEventListener("click", () => openEditor());
  document.querySelector("#nippon-search").addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLocaleLowerCase("id-ID");
    filterAndRender();
  });
  document.querySelector("#nippon-body").addEventListener("click", (event) => {
    const button = event.target.closest("[data-nippon-action]");
    if (!button) return;
    const product = state.products.find((item) => item.priceId === button.dataset.priceId);
    if (!product) return;
    if (button.dataset.nipponAction === "edit") openEditor(product);
    if (button.dataset.nipponAction === "calculate") {
      document.querySelector("#nippon-calc-product").value = product.priceId;
      updateCalculation();
      document.querySelector("#nippon-calc-title").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
  document.querySelector("#nippon-calc-product").addEventListener("change", updateCalculation);
  document.querySelector("#nippon-calc-ink").addEventListener("input", updateCalculation);
  document.querySelector("#nippon-editor-form").addEventListener("submit", saveProduct);
  document.querySelector("#nippon-editor-close").addEventListener("click", closeEditor);
  document.querySelector("#nippon-editor-modal").addEventListener("click", (event) => {
    if (event.target.closest("[data-nippon-close]")) closeEditor();
  });
  if (state.escapeHandler) document.removeEventListener("keydown", state.escapeHandler);
  state.escapeHandler = (event) => {
    if (event.key === "Escape" && !document.querySelector("#nippon-editor-modal")?.classList.contains("hidden")) closeEditor();
  };
  document.addEventListener("keydown", state.escapeHandler);
}

async function loadProducts() {
  const button = document.querySelector("#nippon-refresh");
  if (!button) return;
  button.disabled = true;
  button.textContent = "↻ Memuat...";
  setListState("loading", state.products.length ? "" : "Memuat daftar harga...");
  try {
    const rows = await request("listNipponPrices", { limit: 500 });
    if (!document.querySelector("#nippon-price-page")) return;
    if (!Array.isArray(rows)) throw new Error("Format daftar harga tidak dikenali.");
    state.products = rows.filter((row) => row && row.active !== false);
    document.querySelector("#nippon-count").textContent = countFormat.format(state.products.length);
    document.querySelector("#nippon-status").textContent = "Siap";
    document.querySelector("#nippon-updated").textContent = "Diperbarui " + new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short" }).format(new Date());
    populateCalculator();
    filterAndRender();
  } catch (error) {
    if (!document.querySelector("#nippon-price-page")) return;
    setListState("error", "Daftar harga gagal dimuat. " + (error?.message || "Periksa koneksi GAS."));
    document.querySelector("#nippon-status").textContent = "Gagal";
    document.querySelector("#nippon-updated").textContent = error?.message || "Periksa endpoint GAS Invoice.";
  } finally {
    if (document.querySelector("#nippon-price-page")) {
      button.disabled = false;
      button.textContent = "↻ Refresh";
    }
  }
}
function filterAndRender() {
  const query = state.search;
  state.filtered = state.products.filter((item) => !query ||
    [item.productName, item.size].some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(query)));
  const body = document.querySelector("#nippon-body");
  if (!body) return;
  body.innerHTML = state.filtered.map((item) => `
    <tr><td><strong>${esc(item.productName)}</strong></td><td>${esc(item.size)}</td>
      <td class="nippon-money">${esc(fmtMoney(item.baseCost))}</td>
      <td>${esc(formatDate(item.updatedAt))}</td>
      <td><div class="nippon-row-actions">
        <button type="button" class="btn btn-light" data-nippon-action="calculate" data-price-id="${esc(item.priceId)}">Hitung HPP</button>
        <button type="button" class="btn btn-light" data-nippon-action="edit" data-price-id="${esc(item.priceId)}">Edit</button>
      </div></td></tr>`).join("");
  document.querySelector("#nippon-table-wrap").classList.toggle("hidden", !state.filtered.length);
  setListState(state.filtered.length ? "hidden" : "empty",
    state.products.length ? "Tidak ada produk yang cocok dengan pencarian." : "Belum ada produk Nippon Paint. Tambahkan data HPP dasar pertama.");
}
function setListState(kind, message) {
  const stateEl = document.querySelector("#nippon-list-state");
  if (!stateEl) return;
  if (kind === "hidden") {
    stateEl.classList.add("hidden");
    return;
  }
  stateEl.className = "table-state " + kind;
  stateEl.textContent = message;
  stateEl.classList.remove("hidden");
  document.querySelector("#nippon-table-wrap")?.classList.add("hidden");
}
function formatDate(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
function populateCalculator() {
  const select = document.querySelector("#nippon-calc-product");
  if (!select) return;
  const selected = select.value;
  select.innerHTML = '<option value="">Pilih produk</option>' + state.products
    .map((item) => `<option value="${esc(item.priceId)}">${esc(item.productName)} · ${esc(item.size)}</option>`).join("");
  if (state.products.some((item) => item.priceId === selected)) select.value = selected;
  updateCalculation();
}
function updateCalculation() {
  const selected = document.querySelector("#nippon-calc-product")?.value;
  const product = state.products.find((item) => item.priceId === selected);
  const baseCost = Number(product?.baseCost) || 0;
  const inkCost = Math.max(0, parseMoney(document.querySelector("#nippon-calc-ink")?.value));
  document.querySelector("#nippon-calc-base").textContent = fmtMoney(baseCost);
  document.querySelector("#nippon-calc-ink-result").textContent = fmtMoney(inkCost);
  document.querySelector("#nippon-calc-total").textContent = fmtMoney(baseCost + inkCost);
}
function openEditor(product = null) {
  state.editingId = product?.priceId || "";
  state.focusBeforeModal = document.activeElement;
  document.querySelector("#nippon-editor-title").textContent = product ? "Edit Produk" : "Tambah Produk";
  document.querySelector("#nippon-product-name").value = product?.productName || "";
  document.querySelector("#nippon-product-size").value = product?.size || "";
  document.querySelector("#nippon-product-cost").value = product ? String(Math.round(Number(product.baseCost) || 0)) : "";
  document.querySelector("#nippon-editor-error").classList.add("hidden");
  document.querySelector("#nippon-editor-modal").classList.remove("hidden");
  document.querySelector("#nippon-editor-modal").setAttribute("aria-hidden", "false");
  document.querySelector("#nippon-product-name").focus();
}
function closeEditor() {
  const modal = document.querySelector("#nippon-editor-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  state.focusBeforeModal?.focus?.();
}
async function saveProduct(event) {
  event.preventDefault();
  const button = document.querySelector("#nippon-save");
  const errorEl = document.querySelector("#nippon-editor-error");
  const cost = parseMoney(document.querySelector("#nippon-product-cost").value);
  const payload = {
    priceId: state.editingId || undefined,
    productName: document.querySelector("#nippon-product-name").value.trim(),
    size: document.querySelector("#nippon-product-size").value.trim(),
    baseCost: cost
  };
  if (!payload.productName || !payload.size || cost <= 0) {
    errorEl.textContent = "Nama barang, ukuran, dan HPP dasar di atas Rp0 wajib diisi.";
    errorEl.classList.remove("hidden");
    return;
  }
  button.disabled = true;
  button.textContent = "Menyimpan...";
  errorEl.classList.add("hidden");
  try {
    await request("saveNipponPrice", {}, "POST", payload);
    closeEditor();
    await loadProducts();
  } catch (error) {
    errorEl.textContent = error?.message || "Produk gagal disimpan.";
    errorEl.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.textContent = "Simpan Produk";
  }
}
