const BONUS_GAS_URL = "https://script.google.com/macros/s/AKfycbyaUscsruoi7X_uWF1P1-CIbZ27QFsSajqeFDHwcCAK578WJ32MI30Uujxtj9FYnqFf/exec";
const state = { periods: [], selectedPeriodId: "", dashboard: null, query: "", escapeHandler: null, focusBeforeDialog: null };
const moneyFormat = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const countFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const root = () => document.querySelector("#page-content");
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const money = (value) => moneyFormat.format(Number(value) || 0);
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
function parseMoney(value) {
  const raw = String(value ?? "").trim().replace(/[^0-9,.-]/g, "");
  if (!raw) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : (/^-?\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw);
  const valueNumber = Number(normalized);
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}
function buildUrl(action, params = {}) {
  const url = new URL(BONUS_GAS_URL);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value)); });
  return url.toString();
}
async function request(action, params = {}, method = "GET", payload = {}) {
  const response = await fetch(buildUrl(action, params), {
    method, cache: "no-store",
    ...(method === "POST" ? { headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, ...payload }) } : {})
  });
  const body = await response.text();
  let result;
  try { result = JSON.parse(body); } catch { throw new Error("Respons GAS Bonus Tukang bukan JSON valid."); }
  if (!response.ok || result?.success === false) throw new Error(result?.message || "Permintaan Bonus Tukang gagal.");
  return result?.data;
}

export function renderBonusTukangPage() {
  state.periods = [];
  state.selectedPeriodId = "";
  state.dashboard = null;
  state.query = "";
  root().innerHTML = `
    <section class="page-heading bonus-heading">
      <div><p class="eyebrow">Program Loyalitas Mitra</p><h2>Bonus Tukang</h2>
        <p class="page-description">Catat tukang, konsumen/proyek, nota belanja, dan pembayaran secara manual untuk menghitung bonus tahunan.</p></div>
      <div class="bonus-heading-actions"><button id="bonus-refresh" class="btn btn-light" type="button">↻ Refresh</button><button id="bonus-add-worker" class="btn btn-primary" type="button">＋ Tambah Tukang</button></div>
    </section>
    <section class="card panel bonus-period-panel" aria-labelledby="bonus-period-title">
      <div class="bonus-period-head"><div><p class="eyebrow">Kalender Lebaran</p><h3 id="bonus-period-title">Periode Bonus Tahunan</h3><p>Tanggal Lebaran diisi sesuai tanggal resmi. Pembagian dijadwalkan 7 atau 10 hari sebelumnya.</p></div><button id="bonus-period-edit" class="btn btn-light" type="button">Atur Periode</button></div>
      <div class="bonus-period-info" id="bonus-period-info"><span class="table-state loading">Memuat periode...</span></div>
      <div class="bonus-period-select"><label class="bonus-period-label" for="bonus-period-select"><span>PERIODE BONUS</span><strong>Pilih periode Lebaran</strong></label><div class="bonus-period-control"><span id="bonus-period-current" class="bonus-period-current">Belum dibuat</span><select id="bonus-period-select" aria-label="Pilih periode Lebaran"><option value="">Periode bonus belum dibuat</option></select></div></div>
    </section>
    <section class="summary-grid bonus-summary" aria-label="Ringkasan bonus tukang">
      <article class="summary-card"><span>Tukang Aktif</span><strong id="bonus-worker-count">0</strong><small>terdaftar</small></article>
      <article class="summary-card"><span>Bonus Layak Dibayar</span><strong id="bonus-eligible-total">Rp0</strong><small>nota cohort sudah lunas</small></article>
      <article class="summary-card"><span>Bonus Tertunda</span><strong id="bonus-pending-total">Rp0</strong><small>menunggu pelunasan</small></article>
      <article class="summary-card"><span>Total Kekurangan</span><strong id="bonus-outstanding-total">Rp0</strong><small>seluruh nota aktif</small></article>
    </section>
    <section class="card panel bonus-main-panel">
      <div class="toolbar bonus-toolbar">
        <div class="bonus-toolbar-copy"><h3>Daftar Tukang</h3><p>Cari tukang atau konsumen untuk melihat rincian belanja dan bonus.</p></div>
        <label class="search-box" for="bonus-search"><span aria-hidden="true">⌕</span><input id="bonus-search" type="search" placeholder="Cari nama tukang atau konsumen..." autocomplete="off"></label>
      </div>
      <div id="bonus-feedback" class="bonus-feedback hidden" role="status"></div>
      <div id="bonus-table-state" class="table-state loading" role="status">Memuat data Bonus Tukang...</div>
      <div id="bonus-table-wrap" class="table-scroll hidden"><table class="data-table bonus-table">
        <thead><tr><th scope="col">Tukang</th><th scope="col" class="bonus-project-heading">Proyek</th><th scope="col" class="bonus-number-heading">Total Belanja</th><th scope="col" class="bonus-number-heading">Sudah Dibayar</th><th scope="col" class="bonus-number-heading">Kurang</th><th scope="col" class="bonus-number-heading">Bonus Layak</th><th scope="col" class="bonus-number-heading">Bonus Tertunda</th><th scope="col" class="bonus-action-heading">Aksi</th></tr></thead>
        <tbody id="bonus-worker-body"></tbody>
      </table></div>
      <div id="bonus-worker-cards" class="mobile-data-cards hidden"></div>
    </section>
    <div id="bonus-dialog" class="modal hidden" aria-hidden="true">
      <div class="modal-backdrop" data-bonus-close></div>
      <section class="modal-panel bonus-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="bonus-dialog-title">
        <header class="modal-header"><div><p class="eyebrow">Bonus Tukang</p><h3 id="bonus-dialog-title"></h3></div><button type="button" class="modal-close" data-bonus-close aria-label="Tutup">×</button></header>
        <div id="bonus-dialog-content" class="modal-body"></div>
      </section>
    </div>`;
  bindEvents();
  loadPage();
}

function bindEvents() {
  document.querySelector("#bonus-refresh").addEventListener("click", () => loadPage(true));
  document.querySelector("#bonus-add-worker").addEventListener("click", () => showWorkerForm());
  document.querySelector("#bonus-period-edit").addEventListener("click", () => showPeriodForm());
  document.querySelector("#bonus-period-select").addEventListener("change", async (event) => {
    state.selectedPeriodId = event.target.value;
    await loadDashboard();
  });
  document.querySelector("#bonus-search").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLocaleLowerCase("id-ID");
    renderWorkers();
  });
  document.querySelector("#bonus-worker-body").addEventListener("click", onAction);
  document.querySelector("#bonus-worker-cards").addEventListener("click", onAction);
  document.querySelector("#bonus-dialog").addEventListener("click", (event) => {
    if (event.target.closest("[data-bonus-close]")) closeDialog();
    const button = event.target.closest("[data-bonus-action]");
    if (button) onAction(event);
  });
  document.querySelector("#bonus-dialog-content").addEventListener("submit", onFormSubmit);
  if (state.escapeHandler) document.removeEventListener("keydown", state.escapeHandler);
  state.escapeHandler = (event) => {
    if (event.key === "Escape" && !document.querySelector("#bonus-dialog")?.classList.contains("hidden")) closeDialog();
  };
  document.addEventListener("keydown", state.escapeHandler);
}
async function loadPage(showRefresh = false) {
  const button = document.querySelector("#bonus-refresh");
  if (button) { button.disabled = true; button.textContent = "↻ Memuat..."; }
  try {
    const periods = await request("listBonusPeriods");
    state.periods = Array.isArray(periods) ? periods : [];
    if (!state.periods.some((item) => item.periodId === state.selectedPeriodId)) {
      state.selectedPeriodId = state.periods.find((item) => item.status === "OPEN")?.periodId || state.periods[0]?.periodId || "";
    }
    renderPeriodSelector();
    await loadDashboard();
  } catch (error) {
    const tableState = document.querySelector("#bonus-table-state");
    if (tableState) {
      tableState.className = "table-state error";
      tableState.textContent = "Data Bonus Tukang gagal dimuat. " + (error?.message || "Periksa koneksi GAS.");
    }
    showFeedback(error?.message || "Periksa tab Bonus Tukang di Spreadsheet Invoice.", true);
  } finally {
    if (button) { button.disabled = false; button.textContent = "↻ Refresh"; }
  }
}
function renderPeriodSelector() {
  const select = document.querySelector("#bonus-period-select");
  if (!select) return;
  select.innerHTML = state.periods.length
    ? state.periods.map((period) => `<option value="${esc(period.periodId)}">${esc(String(period.eidYear))} · ${period.status === "OPEN" ? "Aktif" : "Ditutup"}</option>`).join("")
    : '<option value="">Periode bonus belum dibuat</option>';
  select.value = state.selectedPeriodId;
  const currentPeriod = state.periods.find((item) => item.periodId === state.selectedPeriodId);
  const currentBadge = document.querySelector("#bonus-period-current");
  if (currentBadge) {
    currentBadge.textContent = currentPeriod ? (currentPeriod.status === "OPEN" ? "Periode aktif" : "Periode ditutup") : "Belum dibuat";
    currentBadge.classList.toggle("is-closed", currentPeriod?.status !== "OPEN");
  }
  renderPeriodInfo();
}
function renderPeriodInfo() {
  const host = document.querySelector("#bonus-period-info");
  if (!host) return;
  const period = state.periods.find((item) => item.periodId === state.selectedPeriodId);
  if (!period) {
    host.innerHTML = '<div class="bonus-period-empty">Buat periode dan masukkan tanggal Lebaran resmi untuk mulai menghitung bonus.</div>';
    return;
  }
  host.innerHTML = `
    <div><span>Tanggal Lebaran</span><strong>${esc(formatDate(period.eidDate))}</strong></div>
    <div><span>Rencana Pembagian</span><strong>${esc(formatDate(period.payoutDate))}</strong><small>${period.payoutDaysBefore} hari sebelum Lebaran</small></div>
    <div><span>Tarif Periode</span><strong>${esc(String(period.bonusRatePercent))}%</strong></div>
    <div><span>Status Periode</span><strong class="bonus-period-status ${period.status === "OPEN" ? "is-open" : "is-closed"}">${period.status === "OPEN" ? "Aktif" : "Ditutup"}</strong></div>`;
}
async function loadDashboard() {
  const data = await request("getBonusDashboard", { periodId: state.selectedPeriodId });
  state.dashboard = data;
  if (data?.period && !state.periods.some((item) => item.periodId === data.period.periodId)) {
    state.periods.unshift(data.period);
    renderPeriodSelector();
  }
  renderPeriodInfo();
  renderWorkers();
}
function showFeedback(message, isError = false) {
  const el = document.querySelector("#bonus-feedback");
  if (!el) return;
  el.textContent = message;
  el.className = "bonus-feedback" + (isError ? " is-error" : "");
  window.clearTimeout(showFeedback.timer);
  showFeedback.timer = window.setTimeout(() => el.classList.add("hidden"), 7000);
}
function renderWorkers() {
  const dashboard = state.dashboard;
  if (!dashboard) return;
  const workers = dashboard.workers || [];
  const summary = dashboard.summary || {};
  const period = dashboard.period;
  document.querySelector("#bonus-worker-count").textContent = countFormat.format(workers.length);
  document.querySelector("#bonus-eligible-total").textContent = money(summary.eligibleBonus);
  document.querySelector("#bonus-pending-total").textContent = money(summary.pendingBonusEstimate);
  document.querySelector("#bonus-outstanding-total").textContent = money(summary.outstanding);
  const query = state.query;
  const filtered = workers.filter((worker) => {
    const haystack = [worker.name, worker.phone, worker.address, ...worker.projects.map((project) => project.customerName + " " + project.customerCode + " " + project.projectName)].join(" ").toLocaleLowerCase("id-ID");
    return !query || haystack.includes(query);
  });
  const body = document.querySelector("#bonus-worker-body");
  body.innerHTML = filtered.map((worker) => workerRow(worker, false, period)).join("");
  const cards = document.querySelector("#bonus-worker-cards");
  cards.innerHTML = filtered.map((worker) => workerRow(worker, true, period)).join("");
  const hasRows = filtered.length > 0;
  document.querySelector("#bonus-table-wrap").classList.toggle("hidden", !hasRows);
  cards.classList.toggle("hidden", !hasRows);
  const tableState = document.querySelector("#bonus-table-state");
  tableState.classList.toggle("hidden", hasRows);
  if (!hasRows) {
    tableState.className = "table-state empty";
    tableState.textContent = workers.length ? "Tidak ada data yang cocok dengan pencarian." : "Belum ada tukang. Tambahkan data tukang untuk mulai mencatat konsumen.";
  }
}
function workerRow(worker, card, period) {
  const canPay = period?.status === "OPEN" && Number(worker.eligibleBonus) > 0;
  const actions = `<div class="bonus-row-actions"><button type="button" class="btn btn-light" data-bonus-action="detail" data-worker-id="${esc(worker.workerId)}">Detail</button><button type="button" class="btn btn-light" data-bonus-action="edit-worker" data-worker-id="${esc(worker.workerId)}">Edit</button><button type="button" class="btn btn-primary" data-bonus-action="pay-worker" data-worker-id="${esc(worker.workerId)}" aria-label="Catat Bonus Dibayar untuk ${esc(worker.name)}" title="Catat Bonus Dibayar" ${canPay ? "" : "disabled"}>Bayar Bonus</button></div>`;
  if (card) return `<article class="data-card bonus-worker-card"><div class="bonus-worker-card-head"><div><strong>${esc(worker.name)}</strong><span>${esc(worker.phone || "Nomor HP belum diisi")}</span></div><span>${worker.projects.length} proyek</span></div><dl><div><dt>Total Belanja</dt><dd>${esc(money(worker.totalPurchase))}</dd></div><div><dt>Dibayar</dt><dd>${esc(money(worker.totalPaid))}</dd></div><div><dt>Kurang</dt><dd>${esc(money(worker.outstanding))}</dd></div><div><dt>Bonus Layak</dt><dd class="bonus-good">${esc(money(worker.eligibleBonus))}</dd></div><div><dt>Tertunda</dt><dd>${esc(money(worker.pendingBonusEstimate))}</dd></div></dl>${actions}</article>`;
  return `<tr><td><strong>${esc(worker.name)}</strong><small class="bonus-contact">${esc(worker.phone || "Nomor HP belum diisi")}</small></td><td class="bonus-project-count">${countFormat.format(worker.projects.length)}</td><td class="bonus-money">${esc(money(worker.totalPurchase))}</td><td class="bonus-money">${esc(money(worker.totalPaid))}</td><td class="bonus-money">${esc(money(worker.outstanding))}</td><td class="bonus-money bonus-good">${esc(money(worker.eligibleBonus))}</td><td class="bonus-money">${esc(money(worker.pendingBonusEstimate))}</td><td class="bonus-action-cell">${actions}</td></tr>`;
}
async function onAction(event) {
  const button = event.target.closest("[data-bonus-action]");
  if (!button) return;
  const action = button.dataset.bonusAction;
  const worker = state.dashboard?.workers?.find((item) => item.workerId === button.dataset.workerId);
  if (action === "detail" && worker) showWorkerDetail(worker);
  if (action === "edit-worker" && worker) showWorkerForm(worker);
  if (action === "add-project") showProjectForm(button.dataset.workerId || "");
  if (action === "edit-project") {
    const project = state.dashboard?.projects?.find((item) => item.projectId === button.dataset.projectId);
    if (project) showProjectForm(project.workerId, project);
  }
  if (action === "add-note") showNoteForm(button.dataset.projectId || "");
  if (action === "edit-note") {
    const project = state.dashboard?.projects?.find((item) => item.projectId === button.dataset.projectId);
    const note = project?.notes?.find((item) => item.noteId === button.dataset.noteId);
    if (note && !note.bonusRealizationId) showNoteForm(project.projectId, note);
  }
  if (action === "add-payment") showPaymentForm(button.dataset.noteId || "");
  if (action === "pay-worker" && worker) showPayWorkerForm(worker);
}
function openDialog(title, html) {
  state.focusBeforeDialog = document.activeElement;
  const dialog = document.querySelector("#bonus-dialog");
  document.querySelector("#bonus-dialog-title").textContent = title;
  document.querySelector("#bonus-dialog-content").innerHTML = html;
  dialog.classList.remove("hidden");
  dialog.setAttribute("aria-hidden", "false");
  dialog.querySelector("input,select,button")?.focus();
}
function closeDialog() {
  const dialog = document.querySelector("#bonus-dialog");
  if (!dialog) return;
  dialog.classList.add("hidden");
  dialog.setAttribute("aria-hidden", "true");
  state.focusBeforeDialog?.focus?.();
}
function formShell(kind, fields, submitText = "Simpan") {
  return `<form class="bonus-form" data-bonus-form="${kind}"><div class="bonus-form-grid">${fields}</div><p class="bonus-form-error hidden" role="alert"></p><footer class="bonus-form-actions"><button type="button" class="btn btn-light" data-bonus-close>Batal</button><button type="submit" class="btn btn-primary">${submitText}</button></footer></form>`;
}
function textField(label, name, value = "", options = {}) {
  const type = options.type || "text";
  return `<label class="bonus-field ${options.full ? "is-full" : ""}"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${options.required ? "required" : ""} ${options.max ? `maxlength="${options.max}"` : ""} ${options.inputmode ? `inputmode="${options.inputmode}"` : ""} placeholder="${esc(options.placeholder || "")}"></label>`;
}
function selectField(label, name, options, selected, full = false) {
  return `<label class="bonus-field ${full ? "is-full" : ""}"><span>${esc(label)}</span><select name="${name}" required>${options.map((item) => `<option value="${esc(item.value)}" ${String(item.value) === String(selected) ? "selected" : ""}>${esc(item.label)}</option>`).join("")}</select></label>`;
}
function showWorkerForm(worker = null) {
  const fields = textField("Nama tukang", "name", worker?.name || "", { required: true, max: 180, full: true }) +
    textField("Alamat", "address", worker?.address || "", { max: 500, full: true }) +
    textField("Nomor HP", "phone", worker?.phone || "", { type: "tel", max: 40 });
  openDialog(worker ? "Edit Tukang" : "Tambah Tukang", formShell("worker", fields, "Simpan Tukang").replace('<form class="bonus-form" data-bonus-form="worker">','<form class="bonus-form" data-bonus-form="worker" data-worker-id="' + esc(worker?.workerId || "") + '">'));
}
function showProjectForm(workerId = "", project = null) {
  const workers = (state.dashboard?.workers || []).filter((item) => item.active);
  const fields = selectField("Tukang", "workerId", workers.map((item) => ({ value: item.workerId, label: item.name })), workerId || project?.workerId, true) +
    textField("Nama konsumen", "customerName", project?.customerName || "", { required: true, max: 180 }) +
    textField("Kode pelanggan (opsional)", "customerCode", project?.customerCode || "", { max: 80 }) +
    textField("Nama proyek (opsional)", "projectName", project?.projectName || "", { max: 180 });
  openDialog(project ? "Edit Konsumen / Proyek" : "Tambah Konsumen / Proyek",
    formShell("project", fields, "Simpan Proyek").replace('<form class="bonus-form" data-bonus-form="project">','<form class="bonus-form" data-bonus-form="project" data-project-id="' + esc(project?.projectId || "") + '">'));
}
function showNoteForm(projectId = "", note = null) {
  const projects = state.dashboard?.projects || [];
  const fields = selectField("Konsumen / Proyek", "projectId", projects.map((item) => ({ value: item.projectId, label: item.customerName + (item.projectName ? " · " + item.projectName : "") })), projectId || note?.projectId, true) +
    textField("Nomor nota SID Retail", "noteNumber", note?.noteNumber || "", { required: true, max: 100 }) +
    textField("Tanggal nota", "noteDate", note?.noteDate || today(), { type: "date", required: true }) +
    textField("Total belanja nota (Rp)", "totalPurchase", note ? String(note.totalPurchase) : "", { required: true, inputmode: "numeric" });
  openDialog(note ? "Edit Nota" : "Tambah Nota", formShell("note", fields, "Simpan Nota")
    .replace('<form class="bonus-form" data-bonus-form="note">','<form class="bonus-form" data-bonus-form="note" data-note-id="' + esc(note?.noteId || "") + '">'));
}
function showPaymentForm(noteId = "") {
  const notes = [];
  (state.dashboard?.projects || []).forEach((project) => (project.notes || []).forEach((note) => {
    if (!note.bonusRealizationId && note.outstanding > 0) notes.push({ noteId: note.noteId, label: project.customerName + " · Nota " + note.noteNumber + " · Sisa " + money(note.outstanding), note: note });
  }));
  const fields = selectField("Nota", "noteId", notes.map((item) => ({ value: item.noteId, label: item.label })), noteId || notes[0]?.noteId, true) +
    textField("Tanggal pembayaran", "paymentDate", today(), { type: "date", required: true }) +
    textField("Jumlah dibayar (Rp)", "amount", "", { required: true, inputmode: "numeric" }) +
    textField("Referensi / keterangan", "reference", "", { max: 180, full: true });
  openDialog("Catat Pembayaran Nota", notes.length ? formShell("payment", fields, "Simpan Pembayaran") : '<div class="bonus-empty-note">Tidak ada nota yang masih memiliki kekurangan pembayaran.</div>');
}
function showPeriodForm() {
  const period = state.periods.find((item) => item.periodId === state.selectedPeriodId);
  const year = period?.eidYear || new Date().getFullYear();
  const fields = textField("Tahun periode Lebaran", "eidYear", String(year), { type: "number", required: true, max: 4 }) +
    textField("Tanggal Lebaran resmi", "eidDate", period?.eidDate || "", { type: "date", required: true }) +
    selectField("Rencana pembagian", "payoutDaysBefore", [{ value: 7, label: "7 hari sebelum Lebaran" }, { value: 10, label: "10 hari sebelum Lebaran" }], period?.payoutDaysBefore || 7) +
    textField("Tarif bonus (%)", "bonusRatePercent", String(period?.bonusRatePercent ?? 1), { type: "number", required: true });
  openDialog(period ? "Ubah Periode Lebaran" : "Buat Periode Lebaran", formShell("period", fields, "Simpan Periode"));
}
function showPayWorkerForm(worker) {
  const period = state.dashboard?.period;
  const projects = worker.projects.filter((item) => item.status === "ELIGIBLE");
  const html = `<div class="bonus-pay-confirm"><p>Catat pembayaran bonus untuk <strong>${esc(worker.name)}</strong> pada periode ${esc(String(period?.eidYear || ""))}.</p><div class="bonus-pay-total"><span>Total bonus layak dibayar</span><strong>${esc(money(worker.eligibleBonus))}</strong></div><ul>${projects.map((project) => `<li>${esc(project.customerName)}${project.projectName ? " · " + esc(project.projectName) : ""}: ${esc(money(project.eligibleBonus))}</li>`).join("")}</ul>${textField("Tanggal pembayaran aktual", "payoutDate", today(), { type: "date", required: true })}${textField("Referensi / catatan", "reference", "", { max: 180 })}<p class="bonus-soft-note">Tombol ini mencatat bonus yang sudah diserahkan. Aplikasi tidak mengirim transfer.</p></div>`;
  openDialog("Konfirmasi Pembayaran Bonus", formShell("payout", html, "Catat Bonus Dibayar")
    .replace('<form class="bonus-form" data-bonus-form="payout">','<form class="bonus-form" data-bonus-form="payout" data-worker-id="' + esc(worker.workerId) + '">'));
}
function showWorkerDetail(worker) {
  const projects = worker.projects || [];
  const projectHtml = projects.length ? projects.map((project) => {
    const notes = project.notes || [];
    const notesTable = notes.length ? `
      <div class="bonus-note-table-scroll">
        <table class="bonus-note-table">
          <thead><tr><th>Nota</th><th>Tanggal</th><th>Total Nota</th><th>Sudah Dibayar</th><th>Sisa</th><th>Status / Aksi</th></tr></thead>
          <tbody>${notes.map((note) => {
            const noteStatus = note.bonusRealizationId ? "Bonus direalisasikan" : Number(note.outstanding) <= 0 ? "Lunas" : "Belum lunas";
            const noteStatusClass = note.bonusRealizationId ? "is-realized" : Number(note.outstanding) <= 0 ? "is-paid" : "is-pending";
            const actions = note.bonusRealizationId
              ? '<span class="bonus-note-status is-realized">Sudah direalisasikan</span>'
              : Number(note.outstanding) > 0
                ? `<div class="bonus-note-actions"><button type="button" class="btn btn-light" data-bonus-action="edit-note" data-project-id="${esc(project.projectId)}" data-note-id="${esc(note.noteId)}">Edit</button><button type="button" class="btn btn-light" data-bonus-action="add-payment" data-note-id="${esc(note.noteId)}">Catat Bayar</button></div>`
                : '<span class="bonus-note-status is-paid">Lunas</span>';
            return `<tr>
              <td data-label="Nota"><strong>${esc(note.noteNumber)}</strong><span class="bonus-note-status ${noteStatusClass} bonus-mobile-status">${esc(noteStatus)}</span></td>
              <td data-label="Tanggal">${esc(formatDate(note.noteDate))}</td>
              <td data-label="Total Nota" class="bonus-table-money">${esc(money(note.totalPurchase))}</td>
              <td data-label="Sudah Dibayar" class="bonus-table-money">${esc(money(note.totalPaid))}</td>
              <td data-label="Sisa" class="bonus-table-money">${esc(money(note.outstanding))}</td>
              <td data-label="Status / Aksi">${actions}</td>
            </tr>`;
          }).join("")}</tbody>
        </table>
      </div>` : '<p class="bonus-empty-note">Belum ada nota untuk konsumen/proyek ini.</p>';
    const bonusLabel = project.status === "ELIGIBLE" ? money(project.eligibleBonus) : project.status === "PENDING" ? money(project.pendingBonusEstimate) + " · tertunda" : "Sudah direalisasikan";
    return `
      <section class="bonus-project-section">
        <header class="bonus-project-header"><div class="bonus-project-title"><span class="bonus-section-kicker">KONSUMEN / PROYEK</span><h4>${esc(project.customerName)}${project.customerCode ? ` <small>· ${esc(project.customerCode)}</small>` : ""}</h4><p>${esc(project.projectName || "Konsumen")}</p></div><button type="button" class="btn btn-light" data-bonus-action="edit-project" data-project-id="${esc(project.projectId)}">Edit</button></header>
        <div class="bonus-project-metrics"><div><span>Total belanja</span><strong>${esc(money(project.totalPurchase))}</strong></div><div><span>Sudah dibayar</span><strong>${esc(money(project.totalPaid))}</strong></div><div><span>Kekurangan</span><strong>${esc(money(project.outstanding))}</strong></div><div><span>Bonus periode ini</span><strong class="${project.status === "ELIGIBLE" ? "is-eligible" : ""}">${esc(bonusLabel)}</strong></div></div>
        <div class="bonus-project-actions"><span>Daftar nota</span><button type="button" class="btn btn-light" data-bonus-action="add-note" data-project-id="${esc(project.projectId)}">＋ Tambah Nota</button></div>
        ${notesTable}
      </section>`;
  }).join("") : '<div class="bonus-detail-empty"><strong>Belum ada konsumen atau proyek</strong><span>Tambahkan konsumen untuk mulai mencatat nota dari SID Retail.</span></div>';
  openDialog("Detail Tukang · " + worker.name, `
    <div class="bonus-detail-toolbar"><div class="bonus-worker-contact"><div><span>Alamat</span><strong>${esc(worker.address || "Belum diisi")}</strong></div><div><span>Nomor HP</span><strong>${esc(worker.phone || "Belum diisi")}</strong></div></div><button type="button" class="btn btn-primary" data-bonus-action="add-project" data-worker-id="${esc(worker.workerId)}">＋ Tambah Konsumen / Proyek</button></div>
    <section class="bonus-detail-summary" aria-label="Ringkasan tukang"><div><span>Total belanja</span><strong>${esc(money(worker.totalPurchase))}</strong></div><div><span>Total dibayar</span><strong>${esc(money(worker.totalPaid))}</strong></div><div><span>Total kekurangan</span><strong>${esc(money(worker.outstanding))}</strong></div><div><span>Bonus layak periode ini</span><strong class="is-eligible">${esc(money(worker.eligibleBonus))}</strong></div></section>
    <div class="bonus-detail-projects"><div class="bonus-detail-section-heading"><div><span class="bonus-section-kicker">RINCIAN</span><h4>Konsumen dan nota</h4></div><span>${projects.length} konsumen/proyek</span></div>${projectHtml}</div>`);
}
function formatDate(value) {
  if (!value) return "Belum ditentukan";
  const date = new Date(String(value).length === 10 ? value + "T12:00:00" : value);
  if (isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(date);
}
async function onFormSubmit(event) {
  const form = event.target.closest("[data-bonus-form]");
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const button = form.querySelector('[type="submit"]');
  const errorEl = form.querySelector(".bonus-form-error");
  if (button) { button.disabled = true; button.textContent = "Menyimpan..."; }
  if (errorEl) { errorEl.textContent = ""; errorEl.classList.add("hidden"); }
  try {
    const kind = form.dataset.bonusForm;
    if (kind === "worker") await request("saveBonusWorker", {}, "POST", { workerId: form.dataset.workerId || undefined, ...data });
    if (kind === "project") await request("saveBonusProject", {}, "POST", { projectId: form.dataset.projectId || undefined, ...data });
    if (kind === "note") await request("saveBonusNote", {}, "POST", { ...data, noteId: form.dataset.noteId || undefined, totalPurchase: parseMoney(data.totalPurchase) });
    if (kind === "payment") await request("saveBonusPayment", {}, "POST", { amount: parseMoney(data.amount), ...data });
    if (kind === "period") {
      const saved = await request("saveBonusPeriod", {}, "POST", { ...data, eidYear: Number(data.eidYear), payoutDaysBefore: Number(data.payoutDaysBefore), bonusRatePercent: Number(data.bonusRatePercent) });
      state.selectedPeriodId = saved.periodId;
    }
    if (kind === "payout") {
      const period = state.dashboard?.period;
      await request("payBonusWorker", {}, "POST", {
        periodId: period?.periodId,
        workerId: form.dataset.workerId,
        payoutDate: data.payoutDate,
        reference: data.reference
      });
    }
    closeDialog();
    await loadPage();
    if (kind === "payout") showFeedback("Realisasi bonus berhasil dicatat.");
    else showFeedback("Data Bonus Tukang berhasil disimpan.");
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = error?.message || "Data gagal disimpan.";
      errorEl.classList.remove("hidden");
    } else showFeedback(error?.message || "Data gagal disimpan.", true);
  } finally {
    if (button) { button.disabled = false; button.textContent = kindSubmitLabel(form.dataset.bonusForm); }
  }
}
function kindSubmitLabel(kind) {
  return ({ worker: "Simpan Tukang", project: "Simpan Proyek", note: "Simpan Nota", payment: "Simpan Pembayaran", period: "Simpan Periode", payout: "Catat Bonus Dibayar" })[kind] || "Simpan";
}
