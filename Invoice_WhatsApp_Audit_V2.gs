/**
 * ============================================================
 * TB NUSANTARA - INVOICE WHATSAPP AUDIT V2
 * ============================================================
 * READ-ONLY diagnostic module.
 *
 * Audit target:
 * R43-261225003
 *
 * Tahap audit:
 * 1. Baca header penjualan.
 * 2. Inspeksi schema itempenjualan agar nama kolom tidak ditebak.
 * 3. Jika schema sudah diketahui, baru lanjutkan rekonsiliasi detail.
 *
 * Modul ini TIDAK mengubah data.
 * Modul ini BELUM menjadi API/production module.
 */

function auditInvoiceWhatsApp_V2(kodeTransaksi) {
  const kode = String(kodeTransaksi || '').trim();

  if (!kode) throw new Error('Kode transaksi kosong.');
  if (!/^[a-zA-Z0-9._\- ]+$/.test(kode)) {
    throw new Error('Kode transaksi tidak valid.');
  }

  const escapedKode = kode.replace(/'/g, "''");

  const headerQuery =
    'SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,jumlah,bayar,angsuran,piutang ' +
    'FROM penjualan ' +
    "WHERE kode = '" + escapedKode + "' LIMIT 1";

  console.log('======================================');
  console.log('AUDIT INVOICE WHATSAPP V2');
  console.log('READ-ONLY');
  console.log('KODE: ' + kode);
  console.log('======================================');

  console.log('HEADER QUERY: ' + headerQuery);
  const headerResult = sidRetailQuery(headerQuery);

  if (!headerResult || headerResult.status !== 'success') {
    throw new Error('Gagal mengambil header invoice: ' + JSON.stringify(headerResult));
  }

  const headerRows = Array.isArray(headerResult.data) ? headerResult.data : [];
  if (!headerRows.length) {
    throw new Error('Invoice tidak ditemukan: ' + kode);
  }

  const header = headerRows[0];

  /*
   * Diagnostic schema:
   * Jangan menebak nama kolom itempenjualan.
   * Kita minta database mengembalikan struktur tabel terlebih dahulu.
   */
  const schemaQuery = 'SHOW COLUMNS FROM itempenjualan';

  console.log('--------------------------------------');
  console.log('ITEMPENJUALAN SCHEMA QUERY');
  console.log('QUERY: ' + schemaQuery);

  const schemaResult = sidRetailQuery(schemaQuery);

  if (!schemaResult || schemaResult.status !== 'success') {
    throw new Error(
      'Gagal membaca schema itempenjualan: ' + JSON.stringify(schemaResult)
    );
  }

  const schemaRows = Array.isArray(schemaResult.data) ? schemaResult.data : [];

  console.log('COLUMN COUNT: ' + schemaRows.length);

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

  const fieldNames = schemaRows.map(function(column) {
    return String(column.Field || column.field || '').trim();
  }).filter(Boolean);

  const subtotalField = fieldNames.find(function(field) {
    return field.toLowerCase() === 'subtotal';
  }) || '';

  console.log('--------------------------------------');
  console.log('SCHEMA SUMMARY');
  console.log('FIELDS: ' + JSON.stringify(fieldNames));
  console.log('SUBTOTAL FIELD: ' + (subtotalField || 'TIDAK DITEMUKAN'));

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
      ? 'Schema ditemukan. Jangan gunakan nama kolom relasi sebelum teridentifikasi dari schema.'
      : 'Kolom subtotal tidak ditemukan. Audit detail harus dihentikan sampai schema diperiksa.'
  };

  console.log('======================================');
  console.log('HEADER AUDIT');
  console.log(JSON.stringify(audit, null, 2));
  console.log('======================================');

  return {
    status: 'success',
    audit: audit,
    schema: schemaRows
  };
}

function testAuditInvoiceAngsuran_V2() {
  return auditInvoiceWhatsApp_V2('R43-261225003');
}
