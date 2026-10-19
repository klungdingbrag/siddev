const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 2
});

const taxModes = Object.freeze({
  nonluxury: { name: "BKP/JKP nonmewah · DPP Nilai Lain", taxRate: 0.12, dppFactor: 11 / 12 },
  full: { name: "DPP penuh · tarif 12%", taxRate: 0.12, dppFactor: 1 },
  none: { name: "Tanpa PPN", taxRate: 0, dppFactor: 1 }
});

function formatRupiah(value) {
  return rupiah.format(Number.isFinite(value) ? value : 0);
}

function roundRupiah(value) {
  return Math.round(Number(value) || 0);
}

export function renderCalculatorPage() {
  const root = document.querySelector("#page-content");
  if (!root) return;

  root.innerHTML =
    '<section class="calculator-page">' +
      '<header class="page-heading calculator-heading">' +
        '<div><p class="eyebrow">Alat Bantu</p><h2>Kalkulator Pajak Invoice</h2>' +
        '<p class="page-description">Uraikan harga invoice menjadi DPP, PPN, dan potongan PPh bila diperlukan. Perhitungan ini tidak menyimpan atau mengirim data.</p></div>' +
      '</header>' +
      '<div class="calculator-layout">' +
        '<section class="card calculator-input-card" aria-labelledby="calculator-input-title">' +
          '<div class="calculator-card-heading"><div><p class="eyebrow">Input perhitungan</p><h3 id="calculator-input-title">Masukkan nominal invoice</h3></div><span class="calculator-step">01</span></div>' +
          '<label class="calculator-field" for="calculator-amount"><span>Nominal harga</span>' +
            '<div class="calculator-amount-wrap"><span aria-hidden="true">Rp</span><input id="calculator-amount" type="text" inputmode="numeric" autocomplete="off" placeholder="Contoh: 111.000" aria-describedby="calculator-amount-help"></div>' +
            '<small id="calculator-amount-help">Masukkan angka saja atau gunakan titik sebagai pemisah ribuan.</small>' +
          '</label>' +
          '<label class="calculator-field" for="calculator-price-mode"><span>Posisi nominal</span>' +
            '<select id="calculator-price-mode"><option value="inclusive">Harga sudah termasuk PPN</option><option value="exclusive">Harga belum termasuk PPN</option></select>' +
          '</label>' +
          '<label class="calculator-field" for="calculator-tax-mode"><span>Perlakuan PPN</span>' +
            '<select id="calculator-tax-mode"><option value="nonluxury">Nonmewah · tarif 12% × DPP Nilai Lain 11/12</option><option value="full">DPP penuh · tarif 12%</option><option value="none">Tanpa PPN</option></select>' +
            '<small id="calculator-tax-help">Untuk transaksi umum BKP/JKP nonmewah yang menggunakan DPP Nilai Lain.</small>' +
          '</label>' +
          '<div class="calculator-withholding">' +
            '<label class="calculator-switch" for="calculator-pph-enabled"><input id="calculator-pph-enabled" type="checkbox"><span class="calculator-switch-track" aria-hidden="true"></span><span class="calculator-switch-copy"><strong>Hitung potongan PPh</strong><small>Aktifkan hanya jika PPh berlaku untuk transaksi ini.</small></span></label>' +
            '<label class="calculator-field calculator-pph-rate" for="calculator-pph-rate"><span>Tarif PPh (%)</span><div class="calculator-rate-wrap"><input id="calculator-pph-rate" type="number" inputmode="decimal" min="0" max="100" step="0.1" value="1.5" disabled><span>%</span></div><small>Tarif dapat disesuaikan dengan ketentuan transaksi.</small></label>' +
          '</div>' +
          '<div class="calculator-actions"><button id="calculator-reset" class="btn btn-light" type="button">Reset</button></div>' +
        '</section>' +
        '<section class="card calculator-result-card" aria-labelledby="calculator-result-title" aria-live="polite">' +
          '<div class="calculator-card-heading"><div><p class="eyebrow">Hasil</p><h3 id="calculator-result-title">Rincian perhitungan</h3></div><span class="calculator-step calculator-step-result">02</span></div>' +
          '<div class="calculator-total-card"><span>Jumlah bersih dibayar</span><strong id="calculator-net-payable">—</strong><small id="calculator-net-caption">Masukkan nominal untuk memulai perhitungan.</small></div>' +
          '<dl class="calculator-breakdown">' +
            '<div><dt>Nominal invoice</dt><dd id="calculator-input-total">—</dd></div>' +
            '<div><dt>DPP sebelum PPN</dt><dd id="calculator-base">—</dd></div>' +
            '<div class="calculator-core-tax"><dt id="calculator-core-dpp-label">DPP Nilai Lain Coretax</dt><dd id="calculator-core-dpp">—</dd></div>' +
            '<div><dt>PPN <span id="calculator-tax-rate-label"></span></dt><dd id="calculator-vat">—</dd></div>' +
            '<div><dt>Total invoice</dt><dd id="calculator-gross-total">—</dd></div>' +
            '<div class="calculator-pph-line"><dt>Potongan PPh <span id="calculator-pph-rate-label"></span></dt><dd id="calculator-pph">—</dd></div>
            <div class="calculator-net-line"><dt>Total setelah dipotong PPh</dt><dd id="calculator-net-breakdown">—</dd></div>' +
          '</dl>' +
          '<p id="calculator-formula-note" class="calculator-formula-note">Rincian pajak akan tampil setelah nominal dimasukkan.</p>' +
        '</section>' +
      '</div>' +
      '<aside class="calculator-note"><strong>Catatan penggunaan</strong><p>PPN pada harga include ditampilkan sebagai komponen dari nominal invoice, bukan dipotong lagi dari jumlah tagihan. PPh, jika diaktifkan, mengurangi jumlah transfer bersih. Pastikan jenis DPP, tarif, dan kewajiban pemotongan sesuai transaksi.</p></aside>' +
    '</section>';

  const amountInput = root.querySelector("#calculator-amount");
  const priceMode = root.querySelector("#calculator-price-mode");
  const taxMode = root.querySelector("#calculator-tax-mode");
  const pphEnabled = root.querySelector("#calculator-pph-enabled");
  const pphRate = root.querySelector("#calculator-pph-rate");
  const taxHelp = root.querySelector("#calculator-tax-help");

  function amountValue() {
    const digits = amountInput.value.replace(/\D/g, "");
    if (!digits) return null;
    const value = Number(digits);
    return Number.isFinite(value) ? value : null;
  }

  function update() {
    const amount = amountValue();
    const mode = taxModes[taxMode.value] || taxModes.nonluxury;
    const isInclusive = priceMode.value === "inclusive";
    const hasPpn = mode.taxRate > 0;
    const effectiveRate = mode.taxRate * mode.dppFactor;
    const dpp = amount === null ? null : (isInclusive && hasPpn ? amount / (1 + effectiveRate) : amount);
    const dppNilaiLain = dpp === null || !hasPpn ? null : dpp * mode.dppFactor;
    const ppn = dpp === null || !hasPpn ? null : roundRupiah(dppNilaiLain * mode.taxRate);
    const totalInvoice = amount === null ? null : (isInclusive || !hasPpn ? amount : roundRupiah(dpp + ppn));
    const rate = Math.max(0, Math.min(100, Number(pphRate.value) || 0));
    const pph = amount === null ? null : (pphEnabled.checked ? roundRupiah(dpp * rate / 100) : 0);
    const net = totalInvoice === null ? null : Math.max(0, totalInvoice - (pph || 0));

    root.querySelector("#calculator-input-total").textContent = amount === null ? "—" : formatRupiah(amount);
    root.querySelector("#calculator-base").textContent = dpp === null ? "—" : formatRupiah(dpp);
    root.querySelector("#calculator-core-dpp-label").textContent = taxMode.value === "nonluxury" ? "DPP Nilai Lain Coretax" : (taxMode.value === "full" ? "DPP yang digunakan" : "DPP PPN");
    root.querySelector("#calculator-core-dpp").textContent = amount === null ? "—" : (dppNilaiLain === null ? "Tidak digunakan" : formatRupiah(dppNilaiLain));
    root.querySelector("#calculator-vat").textContent = amount === null ? "—" : (ppn === null ? "Rp0" : formatRupiah(ppn));
    root.querySelector("#calculator-gross-total").textContent = totalInvoice === null ? "—" : formatRupiah(totalInvoice);
    root.querySelector("#calculator-pph").textContent = pph === null ? "—" : formatRupiah(pph);
    root.querySelector("#calculator-net-payable").textContent = net === null ? "—" : formatRupiah(net);
    root.querySelector("#calculator-net-breakdown").textContent = net === null ? "—" : formatRupiah(net);
    root.querySelector("#calculator-tax-rate-label").textContent = hasPpn ? "(" + (mode.taxRate * 100).toLocaleString("id-ID") + "%)" : "(0%)";
    root.querySelector("#calculator-pph-rate-label").textContent = pphEnabled.checked ? "(" + rate.toLocaleString("id-ID") + "%)" : "(nonaktif)";
    root.querySelector("#calculator-net-caption").textContent = amount === null
      ? "Masukkan nominal untuk memulai perhitungan."
      : (pphEnabled.checked ? "Total invoice setelah dikurangi potongan PPh." : "Tidak ada potongan PPh yang diterapkan.");
    taxHelp.textContent = taxMode.value === "nonluxury"
      ? "Tarif 12% dikalikan DPP Nilai Lain sebesar 11/12 dari DPP sebelum PPN."
      : (taxMode.value === "full"
          ? "Tarif 12% dikalikan DPP penuh. Gunakan hanya untuk transaksi yang sesuai."
          : "PPN tidak dihitung pada pilihan ini.");
    root.querySelector("#calculator-formula-note").textContent = amount === null
      ? "Rincian pajak akan tampil setelah nominal dimasukkan."
      : (isInclusive
          ? "Nominal yang dimasukkan sudah termasuk PPN; DPP dihitung dengan menguraikan PPN dari harga."
          : "Nominal yang dimasukkan adalah DPP sebelum PPN; PPN ditambahkan untuk memperoleh total invoice.");
  }

  amountInput.addEventListener("input", update);
  priceMode.addEventListener("change", update);
  taxMode.addEventListener("change", update);
  pphEnabled.addEventListener("change", () => {
    pphRate.disabled = !pphEnabled.checked;
    update();
  });
  pphRate.addEventListener("input", update);
  root.querySelector("#calculator-reset").addEventListener("click", () => {
    amountInput.value = "";
    priceMode.value = "inclusive";
    taxMode.value = "nonluxury";
    pphEnabled.checked = false;
    pphRate.value = "1.5";
    pphRate.disabled = true;
    update();
    amountInput.focus();
  });

  update();
}
