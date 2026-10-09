import { api } from "../api/endpoints.js";

const state = { mountId: 0, loading: false, rows: [], filtered: [], search: "", page: 1, pageSize: 25, selectedSupplier: null, detailRows: [], detailSummary: null };
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const root = () => document.querySelector("#page-content");
const money = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const formatMoney = (value) => rupiah.format(money(value));
function esc(value) { return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function getPayload(result) { return result?.data || result || {}; }
function getRows(result) { const p = getPayload(result); return Array.isArray(p.data) ? p.data : []; }
function getSummary(result) { return getPayload(result).summary || {}; }
function codeOf(row) { return row?.kode_supplier || row?.supplier || ""; }
function nameOf(row) { return row?.nama_supplier || row?.nama || codeOf(row) || "Tanpa nama"; }
function formatDate(value) { const s = String(value || ""); const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? m[3]+"-"+m[2]+"-"+m[1] : (s || "—"); }
function mounted(id) { return id === state.mountId && Boolean(document.querySelector("#supplier-hutang-page")); }

export function renderSupplierHutangPage() {
  const mountId = ++state.mountId;
  Object.assign(state, { loading:false, rows:[], filtered:[], search:"", page:1, pageSize:25, selectedSupplier:null, detailRows:[], detailSummary:null });
  root().innerHTML = `
    <section id="supplier-hutang-page">
      <section class="page-heading supplier-hutang-heading"><div><p class="eyebrow">Keuangan · Supplier</p><h2>Hutang Supplier</h2><p class="page-description">Daftar saldo hutang supplier berdasarkan sisa hutang pada transaksi pembelian yang masih outstanding.</p></div><button id="supplier-hutang-refresh" class="btn btn-primary" type="button">↻ Refresh</button></section>
      <section class="summary-grid supplier-hutang-summary">
        <article class="summary-card supplier-hutang-total-card"><span>Total Hutang Supplier</span><strong id="supplier-hutang-total">Rp0</strong><small>seluruh supplier outstanding</small></article>
        <article class="summary-card"><span>Supplier Outstanding</span><strong id="supplier-hutang-suppliers">0</strong><small>supplier dengan saldo hutang</small></article>
        <article class="summary-card"><span>Nota Outstanding</span><strong id="supplier-hutang-invoices">0</strong><small>total nota bersaldo</small></article>
        <article class="summary-card"><span>Status Data</span><strong id="supplier-hutang-status">Siap</strong><small id="supplier-hutang-status-detail">Belum memuat data</small></article>
      </section>
      <section class="card panel supplier-hutang-panel">
        <div class="toolbar supplier-hutang-toolbar"><div class="search-box"><span>⌕</span><input id="supplier-hutang-search" type="search" placeholder="Cari kode atau nama supplier..." autocomplete="off"></div><label class="page-size"><span>Baris</span><select id="supplier-hutang-page-size"><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label></div>
        <div id="supplier-hutang-state" class="table-state loading">Memuat data hutang supplier...</div>
        <div id="supplier-hutang-table-wrap" class="table-scroll hidden"><table class="data-table supplier-hutang-table"><thead><tr><th>Supplier</th><th>Nota</th><th>Total Hutang</th><th>Detail</th></tr></thead><tbody id="supplier-hutang-body"></tbody></table></div>
        <div id="supplier-hutang-cards" class="mobile-data-cards hidden"></div>
        <div id="supplier-hutang-pagination" class="pagination hidden"><button id="supplier-hutang-prev" class="btn btn-light" type="button">← Sebelumnya</button><span id="supplier-hutang-page-info">Halaman 1 / 1</span><button id="supplier-hutang-next" class="btn btn-light" type="button">Berikutnya →</button></div>
      </section>
      <div id="supplier-hutang-modal" class="modal hidden" aria-hidden="true"><div class="modal-backdrop"></div><section class="modal-panel supplier-hutang-modal-panel" role="dialog" aria-modal="true" aria-labelledby="supplier-hutang-detail-title"><div class="modal-header"><div><p class="eyebrow">Supplier Detail</p><h3 id="supplier-hutang-detail-title">Hutang Supplier</h3><span id="supplier-hutang-detail-code" class="modal-code"></span></div><button id="supplier-hutang-detail-close" class="modal-close" type="button" aria-label="Tutup">×</button></div><div id="supplier-hutang-detail-content" class="modal-body"></div></section></div>
    </section>`;
  bindEvents(mountId);
  loadSupplierHutang(mountId);
}

function bindEvents(mountId) {
  document.querySelector("#supplier-hutang-refresh")?.addEventListener("click", () => loadSupplierHutang(mountId, true));
  document.querySelector("#supplier-hutang-search")?.addEventListener("input", e => { state.search=e.target.value.trim().toLowerCase(); state.page=1; applyFilterAndRender(); });
  document.querySelector("#supplier-hutang-page-size")?.addEventListener("change", e => { state.page=Number(e.target.value)||25; renderRows(); });
  document.querySelector("#supplier-hutang-prev")?.addEventListener("click", () => { if(state.page>1){state.page--;renderRows();} });
  document.querySelector("#supplier-hutang-next")?.addEventListener("click", () => { const pages=Math.max(1,Math.ceil(state.filtered.length/state.pageSize)); if(state.page<pages){state.page++;renderRows();} });
  document.querySelector("#supplier-hutang-body")?.addEventListener("click", handleSupplierAction);
  document.querySelector("#supplier-hutang-cards")?.addEventListener("click", handleSupplierAction);
  document.querySelector("#supplier-hutang-detail-close")?.addEventListener("click", closeDetail);
  document.querySelector("#supplier-hutang-modal")?.addEventListener("click", e => { if(e.target.classList.contains("modal-backdrop")) closeDetail(); });
}
async function loadSupplierHutang(mountId, force=false) {
  if(state.loading) return; state.loading=true; setRefreshButton(true); if(!force) setState("loading","Mengambil saldo hutang supplier...");
  try { const result=await api.supplierHutang(); if(!mounted(mountId)) return; state.rows=getRows(result); state.page=1; updateSummary(result); applyFilterAndRender(); setState("",""); }
  catch(error) { if(!mounted(mountId)) return; state.rows=[]; state.filtered=[]; updateSummary(null); renderRows(); setState("error",error?.message||"Gagal mengambil data hutang supplier."); }
  finally { if(mounted(mountId)){state.loading=false;setRefreshButton(false);} }
}
function updateSummary(result) { const s=getSummary(result); const total=money(s.total_hutang); const suppliers=money(s.jumlah_supplier); const invoices=state.rows.reduce((n,r)=>n+money(r.jumlah_nota_bersaldo),0); document.querySelector("#supplier-hutang-total").textContent=formatMoney(total); document.querySelector("#supplier-hutang-suppliers").textContent=number.format(suppliers); document.querySelector("#supplier-hutang-invoices").textContent=number.format(invoices); document.querySelector("#supplier-hutang-status").textContent=result?"Online":"Error"; document.querySelector("#supplier-hutang-status-detail").textContent=result?number.format(state.rows.length)+" supplier dimuat":"Tidak ada data yang tersedia"; }
function applyFilterAndRender() { const q=state.search; state.filtered=!q?[...state.rows]:state.rows.filter(r=>[codeOf(r),nameOf(r)].join(" ").toLowerCase().includes(q)); const pages=Math.max(1,Math.ceil(state.filtered.length/state.pageSize)); state.page=Math.min(state.page,pages); renderRows(); }
function renderRows() { const body=document.querySelector("#supplier-hutang-body"), table=document.querySelector("#supplier-hutang-table-wrap"), cards=document.querySelector("#supplier-hutang-cards"), pagination=document.querySelector("#supplier-hutang-pagination"); if(!body)return; const rows=state.filtered.slice((state.page-1)*state.pageSize,state.page*state.pageSize); if(!rows.length){table.classList.add("hidden");cards.classList.add("hidden");pagination.classList.add("hidden"); if(!state.loading)setState(state.rows.length?"empty":"error",state.rows.length?(state.search?"Tidak ada supplier yang cocok dengan pencarian.":"Tidak ada hutang supplier outstanding."):"Data hutang supplier belum tersedia."); updatePagination(); return;} table.classList.remove("hidden");cards.classList.remove("hidden");pagination.classList.remove("hidden");body.innerHTML=rows.map(supplierRowHtml).join("");cards.innerHTML=rows.map(supplierCardHtml).join("");setState("","");updatePagination(); }
function supplierRowHtml(r) { return `<tr><td><div class="supplier-cell"><strong>${esc(nameOf(r))}</strong><span>${esc(codeOf(r))}</span></div></td><td>${number.format(money(r.jumlah_nota_bersaldo))}</td><td><strong>${formatMoney(r.total_hutang)}</strong></td><td><button class="icon-btn" type="button" data-supplier-code="${esc(codeOf(r))}">Detail</button></td></tr>`; }
function supplierCardHtml(r) { return `<article class="mobile-supplier-card"><div class="mobile-supplier-head"><div><strong>${esc(nameOf(r))}</strong><span>${esc(codeOf(r))}</span></div><button class="icon-btn" type="button" data-supplier-code="${esc(codeOf(r))}">Detail</button></div><div class="mobile-supplier-total"><span>Total hutang</span><strong>${formatMoney(r.total_hutang)}</strong></div><div class="mobile-supplier-meta"><span>Nota outstanding<b>${number.format(money(r.jumlah_nota_bersaldo))}</b></span></div></article>`; }
function updatePagination() { const p=document.querySelector("#supplier-hutang-pagination"),prev=document.querySelector("#supplier-hutang-prev"),next=document.querySelector("#supplier-hutang-next"),info=document.querySelector("#supplier-hutang-page-info"); if(!p)return; const pages=Math.max(1,Math.ceil(state.filtered.length/state.pageSize)); p.classList.toggle("hidden",!state.filtered.length);prev.disabled=state.page<=1||state.loading;next.disabled=state.page>=pages||state.loading;info.textContent="Halaman "+number.format(state.page)+" / "+number.format(pages)+" · "+number.format(state.filtered.length)+" supplier"+(state.search?" · hasil pencarian":""); }
function setState(type,message) { const el=document.querySelector("#supplier-hutang-state"); if(!el)return; el.className="table-state"+(type?" "+type:" hidden");el.textContent=message||""; }
function setRefreshButton(loading) { const b=document.querySelector("#supplier-hutang-refresh"); if(!b)return;b.disabled=loading;b.classList.toggle("ui-busy",loading);b.textContent=loading?"Memuat...":"↻ Refresh"; }
async function handleSupplierAction(e) { const b=e.target.closest("[data-supplier-code]"); if(!b)return; const code=b.dataset.supplierCode;if(code)await openDetail(code); }
async function openDetail(code) { const modal=document.querySelector("#supplier-hutang-modal"),content=document.querySelector("#supplier-hutang-detail-content"),title=document.querySelector("#supplier-hutang-detail-title"),codeEl=document.querySelector("#supplier-hutang-detail-code"); if(!modal)return; state.selectedSupplier=code; const row=state.rows.find(r=>codeOf(r)===code)||{}; title.textContent=nameOf(row);codeEl.textContent=code;content.innerHTML="<div class=\"detail-loading\">Mengambil detail hutang supplier...</div>";modal.classList.remove("hidden");modal.setAttribute("aria-hidden","false");document.body.classList.add("modal-open");
  try { const result=await api.supplierHutangDetail(code); if(state.selectedSupplier!==code)return; const p=getPayload(result); state.detailRows=Array.isArray(p.data)?p.data:[];state.detailSummary=p.summary||{};renderDetail(); } catch(error) { if(state.selectedSupplier===code)content.innerHTML="<div class=\"detail-error\"><strong>Gagal mengambil detail hutang supplier.</strong><span>"+esc(error?.message||"Unknown error")+"</span></div>"; }
}
function renderDetail() { const c=document.querySelector("#supplier-hutang-detail-content"); if(!c)return; const total=money(state.detailSummary.total_nilai_nota),outstanding=money(state.detailSummary.total_hutang),count=money(state.detailSummary.jumlah_nota_bersaldo); c.innerHTML=`<div class="supplier-detail-summary"><div><span>Total nilai nota</span><strong>${formatMoney(total)}</strong></div><div class="supplier-detail-summary-primary"><span>Sisa hutang</span><strong>${formatMoney(outstanding)}</strong></div><div><span>Nota outstanding</span><strong>${number.format(count)}</strong></div></div><div class="detail-heading">Daftar Nota Outstanding</div><div class="detail-table-scroll supplier-detail-table-scroll"><table class="detail-table supplier-detail-table"><thead><tr><th>Nota</th><th>Tanggal</th><th>Total Nota</th><th>Sisa Hutang</th><th>Status</th></tr></thead><tbody>${state.detailRows.length?state.detailRows.map(item=>`<tr><td><strong>${esc(item.nota||"—")}</strong></td><td>${esc(formatDate(item.tanggal))}</td><td>${formatMoney(item.total_nota)}</td><td><strong>${formatMoney(item.sisa_hutang)}</strong></td><td><span class="supplier-status-badge">Outstanding</span></td></tr>`).join(""):"<tr><td colspan=\"5\" class=\"empty-cell\">Tidak ada nota outstanding.</td></tr>"}</tbody></table></div>`; }
function closeDetail() { const modal=document.querySelector("#supplier-hutang-modal"); if(!modal)return;state.selectedSupplier=null;state.detailRows=[];state.detailSummary=null;modal.classList.add("hidden");modal.setAttribute("aria-hidden","true");document.body.classList.remove("modal-open"); }