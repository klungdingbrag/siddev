/**
 * TB NUSANTARA — SUPPLIER HUTANG PDF V1
 * New isolated PDF handlers. Does not change existing supplier or customer logic.
 * Source of truth: pembelian.hutang; outstanding scope only.
 *
 * IMPORTANT: LOGO_URL must point to the committed, verified logo asset on this branch.
 */
var SUPPLIER_HUTANG_PDF_V1 = {
  logoUrl: 'https://raw.githubusercontent.com/klungdingbrag/siddev/ui/ux-polish-v3/assets/img/CV.%20NUSANTARA%20BUILDING%20MATERIAL%20LOGO.png',
  company: 'CV NUSANTARA BUILDING MATERIAL',
  store: 'TB NUSANTARA',
  address: 'JL. LINTAS SELATAN RT.001 RW.001 DK. GAJAH, SUROREJAN PURING KEBUMEN',
  phone: '081234563843',
  detailLimit: 5000
};

function getPdfSupplierHutangSummaryV1(kodeSupplier) {
  var kode = supplierHutangPdfValidateCodeV1(kodeSupplier);
  var meta = supplierHutangPdfGetSupplierV1(kode);
  var rows = supplierHutangPdfGetOutstandingV1(kode);
  if (rows.length >= SUPPLIER_HUTANG_PDF_V1.detailLimit) {
    throw new Error('Daftar nota mencapai batas pengaman ' +
      SUPPLIER_HUTANG_PDF_V1.detailLimit +
      '. PDF dibatalkan agar laporan tidak diam-diam terpotong.');
  }

  var totalNota = rows.reduce(function(sum, row) {
    return sum + row.total_nota;
  }, 0);
  var totalHutang = rows.reduce(function(sum, row) {
    return sum + row.sisa_hutang;
  }, 0);

  var html = supplierHutangPdfHtmlV1({
    title: 'LAPORAN HUTANG SUPPLIER',
    supplier: meta,
    generatedAt: Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm'),
    summary: { count: rows.length, totalNota: totalNota, totalHutang: totalHutang },
    rows: rows,
    singleInvoice: false
  });
  return supplierHutangPdfRenderV1(html, 'Ringkasan-Hutang-' + supplierHutangPdfSafeFilenameV1(kode) + '.pdf');
}

function getPdfSupplierHutangInvoiceV1(kodeSupplier, kodeNota) {
  var kode = supplierHutangPdfValidateCodeV1(kodeSupplier);
  var nota = String(kodeNota || '').trim();
  if (!nota || nota.length > 100) throw new Error('Nomor nota wajib diisi dan harus valid.');
  if (!/^[a-zA-Z0-9._\- ]+$/.test(nota)) throw new Error('Nomor nota tidak valid.');

  var meta = supplierHutangPdfGetSupplierV1(kode);
  var query = 'SELECT p.kode AS nota, p.tanggal AS tanggal, ' +
    'COALESCE(p.jumlah,0) AS total_nota, COALESCE(p.hutang,0) AS sisa_hutang ' +
    'FROM pembelian p WHERE p.supplier = ' + supplierHutangSqlQuoteV1(kode) +
    ' AND p.kode = ' + supplierHutangSqlQuoteV1(nota) +
    " AND p.hutang_ke = 'supplier' AND COALESCE(p.hutang,0) > 0 LIMIT 2";
  var result = sidRetailQuery(query);
  var rows = result && Array.isArray(result.data) ? result.data : [];
  if (rows.length !== 1) {
    throw new Error(rows.length ? 'Nomor nota tidak unik untuk supplier ini.' :
      'Nota tidak ditemukan sebagai hutang supplier outstanding.');
  }
  var row = supplierHutangPdfMapRowV1(rows[0]);
  var html = supplierHutangPdfHtmlV1({
    title: 'DETAIL NOTA HUTANG SUPPLIER',
    supplier: meta,
    generatedAt: Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm'),
    summary: { count: 1, totalNota: row.total_nota, totalHutang: row.sisa_hutang },
    rows: [row],
    singleInvoice: true
  });
  return supplierHutangPdfRenderV1(html,
    'Nota-' + supplierHutangPdfSafeFilenameV1(kode) + '-' +
    supplierHutangPdfSafeFilenameV1(nota) + '.pdf');
}

function supplierHutangPdfValidateCodeV1(value) {
  var kode = String(value || '').trim();
  if (!kode || !/^[a-zA-Z0-9._\- ]+$/.test(kode)) {
    throw new Error('Kode supplier wajib diisi dan harus valid.');
  }
  return kode;
}

function supplierHutangPdfGetSupplierV1(kode) {
  var query = 'SELECT s.kode AS kode_supplier, ' +
    "COALESCE(NULLIF(TRIM(s.nama),''), s.kode) AS nama_supplier " +
    'FROM supplier s WHERE s.kode = ' + supplierHutangSqlQuoteV1(kode) + ' LIMIT 2';
  var result = sidRetailQuery(query);
  var rows = result && Array.isArray(result.data) ? result.data : [];
  if (rows.length !== 1) throw new Error('Supplier tidak ditemukan atau kode supplier tidak unik.');
  return {
    kode: String(rows[0].kode_supplier || kode),
    nama: String(rows[0].nama_supplier || kode)
  };
}

function supplierHutangPdfGetOutstandingV1(kode) {
  var query = 'SELECT p.kode AS nota, p.tanggal AS tanggal, ' +
    'COALESCE(p.jumlah,0) AS total_nota, COALESCE(p.hutang,0) AS sisa_hutang ' +
    'FROM pembelian p WHERE p.supplier = ' + supplierHutangSqlQuoteV1(kode) +
    " AND p.hutang_ke = 'supplier' AND COALESCE(p.hutang,0) > 0 " +
    'ORDER BY p.tanggal ASC, p.kode ASC LIMIT ' + SUPPLIER_HUTANG_PDF_V1.detailLimit;
  var result = sidRetailQuery(query);
  if (!result || result.status !== 'success') throw new Error('Gagal mengambil nota outstanding supplier.');
  return (Array.isArray(result.data) ? result.data : []).map(supplierHutangPdfMapRowV1);
}

function supplierHutangPdfMapRowV1(row) {
  var tanggal = String(row.tanggal || '').trim();
  var age = supplierHutangAgeV1(tanggal);
  return {
    nota: String(row.nota || '').trim(),
    tanggal: tanggal,
    umur_hari: age,
    aging_bucket: supplierHutangAgingBucketV1(age),
    total_nota: Number(row.total_nota || 0),
    sisa_hutang: Number(row.sisa_hutang || 0)
  };
}

function supplierHutangPdfHtmlV1(model) {
  var logoDataUri = supplierHutangPdfGetLogoDataUriV1();
  var rowsHtml = model.rows.map(function(row) {
    return '<tr><td>' + supplierHutangPdfEscapeV1(row.nota) + '</td>' +
      '<td>' + supplierHutangPdfEscapeV1(row.tanggal) + '</td>' +
      '<td class="num">' + row.umur_hari + ' hari</td>' +
      '<td>' + supplierHutangPdfEscapeV1(row.aging_bucket) + '</td>' +
      '<td class="num">' + supplierHutangPdfMoneyV1(row.total_nota) + '</td>' +
      '<td class="num">' + supplierHutangPdfMoneyV1(row.sisa_hutang) + '</td></tr>';
  }).join('');
  if (!rowsHtml) rowsHtml = '<tr><td colspan="6" class="empty">Tidak ada nota outstanding.</td></tr>';

  return '<!doctype html><html><head><meta charset="utf-8"><style>' +
    '@page{size:A4;margin:14mm 12mm}body{font:10px Arial,sans-serif;color:#172033}' +
    '.head{display:flex;align-items:center;gap:16px;border-bottom:3px solid #0b3f88;padding-bottom:12px;margin-bottom:18px}' +
    '.logo{width:115px;height:auto;object-fit:contain}.brand{flex:1}.store{font-size:17px;font-weight:800;color:#0b3f88}' +
    '.company{font-size:12px;font-weight:700;margin:3px 0}.muted{color:#4b5563;line-height:1.5}' +
    'h1{font-size:16px;margin:0 0 12px;color:#0b3f88}.supplier{margin:0 0 12px;font-size:11px}' +
    '.cards{display:flex;gap:8px;margin:14px 0}.card{border:1px solid #dbe3ef;border-radius:5px;padding:9px;flex:1}' +
    '.label{display:block;color:#536174;font-size:9px;margin-bottom:5px}.value{font-size:13px;font-weight:bold}' +
    'table{width:100%;border-collapse:collapse;font-size:9px}th{background:#0b3f88;color:white;text-align:left}' +
    'th,td{padding:7px 6px;border:1px solid #d7deea}tr{page-break-inside:avoid}.num{text-align:right;white-space:nowrap}' +
    '.total-row td{background:#eef3fa;border-top:2px solid #0b3f88;padding-top:9px;padding-bottom:9px}' +
    '.signatures{display:flex;justify-content:space-between;gap:40px;margin:30px 8px 0;page-break-inside:avoid;break-inside:avoid}' +
    '.signature{width:42%;text-align:center;font-size:10px}.sign-space{height:58px}' +
    '.sign-name{font-weight:600}.empty{text-align:center;color:#64748b;padding:16px}' +
    '.foot{margin-top:16px;padding-top:8px;border-top:1px solid #dbe3ef;color:#64748b;font-size:8px}' +
    '</style></head><body><header class="head"><img class="logo" src="' +
    logoDataUri +
    '"><div class="brand"><div class="store">' + SUPPLIER_HUTANG_PDF_V1.store +
    '</div><div class="company">' + SUPPLIER_HUTANG_PDF_V1.company +
    '</div><div class="muted">' + SUPPLIER_HUTANG_PDF_V1.address +
    '<br>Telepon: ' + SUPPLIER_HUTANG_PDF_V1.phone +
    '</div></div></header><h1>' + model.title + '</h1>' +
    '<p class="supplier"><b>Supplier:</b> ' + supplierHutangPdfEscapeV1(model.supplier.nama) +
    ' (' + supplierHutangPdfEscapeV1(model.supplier.kode) + ')<br><b>Dicetak:</b> ' +
    supplierHutangPdfEscapeV1(model.generatedAt) + '</p>' +
    '<table><thead><tr><th>Nomor Nota</th><th>Tanggal</th><th>Umur</th><th>Aging</th><th>Total Nota</th><th>Sisa Hutang</th></tr></thead><tbody>' +
    rowsHtml + '</tbody><tfoot><tr class="total-row"><td colspan="4"><b>TOTAL (' + model.summary.count + ' nota)</b></td>' +
    '<td class="num"><b>' + supplierHutangPdfMoneyV1(model.summary.totalNota) + '</b></td>' +
    '<td class="num"><b>' + supplierHutangPdfMoneyV1(model.summary.totalHutang) + '</b></td></tr></tfoot></table>' +
    '<section class="signatures"><div class="signature"><div>Supplier / Penerima</div><div class="sign-space"></div><div class="sign-name">(________________________)</div></div>' +
    '<div class="signature"><div>TB Nusantara</div><div class="sign-space"></div><div class="sign-name">(________________________)</div></div></section>' +
    '<footer class="foot">Dokumen laporan yang dihasilkan SID Retail; bukan pengganti faktur asli supplier.</footer></body></html>';
}

function supplierHutangPdfGetLogoDataUriV1() {
  // Do not cache the base64 data URI: CacheService has a per-value size limit,
  // and a legitimate company logo may exceed that limit. Fetch the small asset
  // for each PDF request instead of failing with "Argument too large: value".
  var response = UrlFetchApp.fetch(SUPPLIER_HUTANG_PDF_V1.logoUrl, {
    muteHttpExceptions: true,
    followRedirects: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('Logo PDF TB Nusantara belum tersedia pada aset GitHub branch ui/ux-polish-v3. HTTP ' +
      response.getResponseCode() + '. PDF dibatalkan agar kop tidak kehilangan logo.');
  }
  var blob = response.getBlob();
  var contentType = String(blob.getContentType() || 'image/png').toLowerCase();
  if (contentType.indexOf('image/') !== 0) {
    throw new Error('Aset logo PDF tidak dikembalikan sebagai file gambar.');
  }
  return 'data:' + contentType + ';base64,' +
    Utilities.base64Encode(blob.getBytes());
}

function supplierHutangPdfRenderV1(html, filename) {
  var blob = HtmlService.createHtmlOutput(html).getBlob().getAs(MimeType.PDF).setName(filename);
  var bytes = blob.getBytes();
  var base64 = Utilities.base64Encode(bytes);
  if (!base64 || bytes.length < 100) throw new Error('Generator PDF supplier menghasilkan dokumen kosong.');
  var pdfText = Utilities.newBlob(bytes).getDataAsString();
  if (bytes[0] !== 37 || bytes[1] !== 80 || bytes[2] !== 68 ||
      bytes[3] !== 70 || bytes[4] !== 45 ||
      pdfText.lastIndexOf('%%EOF') < 0 || pdfText.lastIndexOf('startxref') < 0) {
    throw new Error('Validasi internal PDF supplier gagal (header/startxref/EOF).');
  }
  return {
    status: 'success',
    filename: filename,
    mime_type: 'application/pdf',
    pdf_base64: base64,
    size_bytes: bytes.length,
    source_contract: 'pembelian.hutang; outstanding supplier only',
    invoice_count: (html.match(/<tr><td>/g) || []).length
  };
}

function supplierHutangPdfMoneyV1(value) {
  return 'Rp ' + Number(value || 0).toLocaleString('id-ID', {
    minimumFractionDigits: 0, maximumFractionDigits: 2
  });
}

function supplierHutangPdfEscapeV1(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function supplierHutangPdfSafeFilenameV1(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'supplier';
}
