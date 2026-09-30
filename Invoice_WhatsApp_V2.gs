/**
 * ============================================================
 * TB NUSANTARA - INVOICE WHATSAPP V2
 * ============================================================
 * Unified module for production data, testing and diagnostics.
 * READ-ONLY. No database mutation. API V1 not changed yet.
 *
 * Current audit target: R43-261225003
 */

/**
 * Production data helper.
 * Accounting values remain based on existing source fields until
 * the installment audit is completed.
 */
function getInvoiceWhatsAppData_V2(kodeTransaksi) {
  const kode = invoiceWhatsAppNormalizeCode_V2_(kodeTransaksi);
  const query =
    'SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,jumlah,bayar,angsuran,piutang ' +
    'FROM penjualan ' +
    "WHERE kode = '" + kode.replace(/'/g, "''") + "' LIMIT 1";

  console.log('INVOICE WHATSAPP V2');
  console.log('KODE: ' + kode);
  console.log('QUERY: ' + query);

  const result = sidRetailQuery(query);
  if (!result || result.status !== 'success') {
    throw new Error('Gagal mengambil data invoice: ' + JSON.stringify(result));
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  if (!rows.length) throw new Error('Invoice tidak ditemukan: ' + kode);

  return invoiceWhatsAppBuildData_V2_(rows[0], kode);
}

/**
 * Diagnostic: inspect itempenjualan schema before querying detail.
 * Do not guess the relation column name.
 */
function auditInvoiceWhatsApp_V2(kodeTransaksi) {
  const kode = invoiceWhatsAppNormalizeCode_V2_(kode);

  const headerQuery =
    'SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,jumlah,bayar,angsuran,piutang ' +
    'FROM penjualan ' +
    "WHERE kode = '" + kode.replace(/'/g, "''") + "' LIMIT 1";

  console.log('======================================');
  console.log('AUDIT INVOICE WHATSAPP V2');
  console.log('READ-ONLY');
  console.log('KODE: ' + kode);
  console.log('======================================');

  const headerResult = sidRetailQuery(headerQuery);
  if (!headerResult || headerResult.status !== 'success') {
    throw new Error('Gagal mengambil header invoice: ' + JSON.stringify(headerResult));
  }

  const headerRows = Array.isArray(headerResult.data) ? headerResult.data : [];
  if (!headerRows.length) throw new Error('Invoice tidak ditemukan: ' + kode);

  const header = headerRows[0];
  const schemaQuery = 'SHOW COLUMNS FROM itempenjualan';

  console.log('--------------------------------------');
  console.log('ITEMPENJUALAN SCHEMA QUERY');
  console.log('QUERY: ' + schemaQuery);

  const schemaResult = sidRetailQuery(schemaQuery);
  if (!schemaResult || schemaResult.status !== 'success') {
    throw new Error('Gagal membaca schema itempenjualan: ' + JSON.stringify(schemaResult));
  }

  const schemaRows = Array.isArray(schemaResult.data) ? schemaResult.data : [];
  const fieldNames = schemaRows.map(function(column) {
    return String(column.Field || column.field || '').trim();
  }).filter(Boolean);

  schemaRows.forEach(function(column, index) {
    console.log(
      'COLUMN ' + (index + 1) +
      ' | FIELD=' + (column.Field || column.field || '') +
      ' | TYPE=' + (column.Type || column.type || '') +
      ' | NULL=' + (column.Null || column.null || '') +
      ' | KEY=' + (column.Key || column.key || '') +
      ' | DEFAULT=' + (column.Default == null ? '' : column.Default)
    );
  });

  const subtotalField = fieldNames.find(function(field) {
    return field.toLowerCase() === 'subtotal';
  }) || '';

  const audit = {
    kode_transaksi: header.kode || kode,
    tanggal: header.tanggal || '',
    pelanggan: header.pelanggan || '',
    nama_pelanggan: header.nama_pelanggan || '',
    jt: header.jt || '',
    penjualan: {
      jumlah: parseMoney(header.jumlah),
      bayar: parseMoney(header.bayar),
      angsuran: parseMoney(header.angsuran),
      piutang: parseMoney(header.piutang)
    },
    itempenjualan_schema: {
      column_count: schemaRows.length,
      fields: fieldNames,
      subtotal_field: subtotalField
    },
    next_step: subtotalField
      ? 'Schema ditemukan. Identifikasi kolom relasi invoice sebelum query detail.'
      : 'Kolom subtotal tidak ditemukan. Audit detail dihentikan sampai schema diperiksa.'
  };

  console.log('--------------------------------------');
  console.log('SCHEMA SUMMARY');
  console.log('FIELDS: ' + JSON.stringify(fieldNames));
  console.log('SUBTOTAL FIELD: ' + (subtotalField || 'TIDAK DITEMUKAN'));
  console.log('======================================');
  console.log(JSON.stringify(audit, null, 2));

  return { status: 'success', audit: audit, schema: schemaRows };
}

/** Test production helper without changing data. */
function testInvoiceWhatsApp_V2() {
  const kodeTransaksi = 'R43-160725009';
  console.log('======================================');
  console.log('TEST INVOICE WHATSAPP V2');
  console.log('READ-ONLY');
  console.log('KODE: ' + kodeTransaksi);
  console.log('======================================');
  const result = getInvoiceWhatsAppData_V2(kodeTransaksi);
  console.log('RESULT: ' + JSON.stringify(result, null, 2));
  return result;
}

/** Test installment audit target. */
function testAuditInvoiceAngsuran_V2() {
  return auditInvoiceWhatsApp_V2('R43-261225003');
}

function invoiceWhatsAppNormalizeCode_V2_(kodeTransaksi) {
  const kode = String(kodeTransaksi || '').trim();
  if (!kode) throw new Error('Kode transaksi kosong.');
  if (!/^[a-zA-Z0-9._\- ]+$/.test(kode)) {
    throw new Error('Kode transaksi tidak valid.');
  }
  return kode;
}

function invoiceWhatsAppBuildData_V2_(row, fallbackCode) {
  const totalInvoice = parseMoney(row.jumlah);
  const saldoHutang = parseMoney(row.piutang);
  const sudahDibayar = Math.max(0, totalInvoice - saldoHutang);

  const data = {
    kode_transaksi: row.kode || fallbackCode,
    tanggal: row.tanggal || '',
    pelanggan: row.pelanggan || '',
    nama_pelanggan: row.nama_pelanggan || '',
    jt: row.jt || '',
    total_invoice: totalInvoice,
    sudah_dibayar: sudahDibayar,
    saldo_hutang: saldoHutang,
    bayar_field: parseMoney(row.bayar),
    angsuran_field: parseMoney(row.angsuran)
  };

  console.log('HASIL INVOICE WHATSAPP V2: ' + JSON.stringify(data));
  return { status: 'success', data: data };
}
