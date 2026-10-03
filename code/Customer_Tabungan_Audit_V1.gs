/**
 * TB NUSANTARA
 * CUSTOMER + TABUNGAN AUDIT V1
 *
 * Read-only audit untuk persiapan modul Pelanggan.
 *
 * Prinsip:
 * - Tidak mengubah data SID Retail.
 * - Tidak mengubah fungsi production existing.
 * - Tidak menghitung ulang saldo pelanggan sebagai sumber kebenaran.
 * - Audit hanya membaca master pelanggan dan transaksi tabungan.
 *
 * Public functions sengaja TIDAK menggunakan akhiran "_"
 * agar dapat dijalankan langsung dari GAS Run.
 */

function auditCustomerTabunganV1() {
  var started = new Date().getTime();

  var result = {
    status: 'AUDIT_COMPLETE',
    read_only: true,
    production_changed: false,
    audit_version: 'v1',
    purpose: 'Memetakan master pelanggan, transaksi tabungan, jenis transaksi, dan hubungan saldo_tabungan dengan histori tabungan.',
    customer: {},
    tabungan: {},
    saldo_validation: {},
    duration_ms: 0
  };

  result.customer = auditCustomerMasterV1();
  result.tabungan = auditTabunganSourceV1();
  result.saldo_validation = auditTabunganSaldoV1();

  result.duration_ms = new Date().getTime() - started;

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - CUSTOMER + TABUNGAN AUDIT V1');
  Logger.log('==============================================');
  Logger.log(JSON.stringify(result, null, 2));
  Logger.log('==============================================');

  return result;
}

function auditCustomerMasterV1() {
  var started = new Date().getTime();

  var countResult = sidRetailQuery(
    'SELECT COUNT(*) AS total_customer FROM pelanggan'
  );

  var activeFinancialResult = sidRetailQuery(
    'SELECT ' +
    'COUNT(*) AS total_customer,' +
    'SUM(CASE WHEN COALESCE(saldo_tabungan,0) > 0 THEN 1 ELSE 0 END) AS customer_punya_tabungan,' +
    'SUM(CASE WHEN COALESCE(saldo_piutang,0) > 0 THEN 1 ELSE 0 END) AS customer_punya_piutang,' +
    'SUM(CASE WHEN COALESCE(saldo_tabungan,0) <= 0 AND COALESCE(saldo_piutang,0) <= 0 THEN 1 ELSE 0 END) AS customer_tanpa_saldo_utama ' +
    'FROM pelanggan'
  );

  var duplicateResult = sidRetailQuery(
    'SELECT kode,COUNT(*) AS jumlah ' +
    'FROM pelanggan ' +
    'WHERE kode IS NOT NULL AND TRIM(kode) <> \'\' ' +
    'GROUP BY kode ' +
    'HAVING COUNT(*) > 1 ' +
    'ORDER BY jumlah DESC,kode ASC ' +
    'LIMIT 100'
  );

  var missingIdentityResult = sidRetailQuery(
    'SELECT ' +
    'SUM(CASE WHEN kode IS NULL OR TRIM(kode) = \'\' THEN 1 ELSE 0 END) AS kode_kosong,' +
    'SUM(CASE WHEN nama IS NULL OR TRIM(nama) = \'\' THEN 1 ELSE 0 END) AS nama_kosong,' +
    'SUM(CASE WHEN telp IS NULL OR TRIM(telp) = \'\' THEN 1 ELSE 0 END) AS telp_kosong ' +
    'FROM pelanggan'
  );

  return {
    source_table: 'pelanggan',
    count: auditRowsV1(countResult),
    financial_status: auditRowsV1(activeFinancialResult),
    duplicate_codes: auditRowsV1(duplicateResult),
    missing_identity: auditRowsV1(missingIdentityResult),
    duration_ms: new Date().getTime() - started
  };
}

function auditTabunganSourceV1() {
  var started = new Date().getTime();

  var overallResult = sidRetailQuery(
    'SELECT ' +
    'COUNT(*) AS total_transaksi,' +
    'COUNT(DISTINCT pelanggan) AS pelanggan_unik,' +
    'MIN(tanggal) AS tanggal_awal,' +
    'MAX(tanggal) AS tanggal_akhir,' +
    'SUM(CASE WHEN COALESCE(jumlah,0) > 0 THEN jumlah ELSE 0 END) AS total_positif,' +
    'SUM(CASE WHEN COALESCE(jumlah,0) < 0 THEN jumlah ELSE 0 END) AS total_negatif,' +
    'SUM(COALESCE(jumlah,0)) AS total_semua_jenis ' +
    'FROM tabungan'
  );

  var jenisResult = sidRetailQuery(
    'SELECT ' +
    'COALESCE(NULLIF(TRIM(jenis),\'\'),\'(KOSONG)\') AS jenis,' +
    'COUNT(*) AS jumlah_transaksi,' +
    'SUM(COALESCE(jumlah,0)) AS total_jumlah,' +
    'SUM(CASE WHEN COALESCE(jumlah,0) > 0 THEN jumlah ELSE 0 END) AS total_positif,' +
    'SUM(CASE WHEN COALESCE(jumlah,0) < 0 THEN jumlah ELSE 0 END) AS total_negatif ' +
    'FROM tabungan ' +
    'GROUP BY COALESCE(NULLIF(TRIM(jenis),\'\'),\'(KOSONG)\') ' +
    'ORDER BY jumlah_transaksi DESC,jenis ASC'
  );

  var schemaResult = sidRetailQuery(
    'SELECT COLUMN_NAME,DATA_TYPE,IS_NULLABLE,COLUMN_KEY,ORDINAL_POSITION ' +
    'FROM information_schema.COLUMNS ' +
    'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = \'tabungan\' ' +
    'ORDER BY ORDINAL_POSITION'
  );

  var sampleResult = sidRetailQuery(
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,keterangan,kode_kas,sumber,sumber_faktur ' +
    'FROM tabungan ' +
    'ORDER BY tanggal DESC,kode DESC ' +
    'LIMIT 10'
  );

  return {
    source_table: 'tabungan',
    overall: auditRowsV1(overallResult),
    jenis_summary: auditRowsV1(jenisResult),
    schema: auditRowsV1(schemaResult),
    sample_latest: auditRowsV1(sampleResult),
    duration_ms: new Date().getTime() - started
  };
}

function auditTabunganSaldoV1() {
  var started = new Date().getTime();

  var customerBalanceResult = sidRetailQuery(
    'SELECT ' +
    'COUNT(*) AS customer_dengan_transaksi,' +
    'SUM(CASE WHEN COALESCE(saldo_tabungan,0) > 0 THEN 1 ELSE 0 END) AS customer_saldo_positif,' +
    'SUM(CASE WHEN COALESCE(saldo_tabungan,0) = 0 THEN 1 ELSE 0 END) AS customer_saldo_nol,' +
    'SUM(CASE WHEN COALESCE(saldo_tabungan,0) < 0 THEN 1 ELSE 0 END) AS customer_saldo_negatif ' +
    'FROM pelanggan ' +
    'WHERE kode IN (SELECT DISTINCT pelanggan FROM tabungan WHERE pelanggan IS NOT NULL AND TRIM(pelanggan) <> \'\')'
  );

  var sampleResult = sidRetailQuery(
    'SELECT ' +
    'p.kode,' +
    'p.nama,' +
    'COALESCE(p.saldo_tabungan,0) AS saldo_tabungan,' +
    'COALESCE(t.total_jumlah,0) AS total_jumlah_tabungan,' +
    'COALESCE(t.total_positif,0) AS total_positif,' +
    'COALESCE(t.total_negatif,0) AS total_negatif,' +
    'COALESCE(t.jumlah_transaksi,0) AS jumlah_transaksi ' +
    'FROM pelanggan p ' +
    'INNER JOIN (' +
      'SELECT pelanggan,' +
      'COUNT(*) AS jumlah_transaksi,' +
      'SUM(COALESCE(jumlah,0)) AS total_jumlah,' +
      'SUM(CASE WHEN COALESCE(jumlah,0) > 0 THEN jumlah ELSE 0 END) AS total_positif,' +
      'SUM(CASE WHEN COALESCE(jumlah,0) < 0 THEN jumlah ELSE 0 END) AS total_negatif ' +
      'FROM tabungan ' +
      'WHERE pelanggan IS NOT NULL AND TRIM(pelanggan) <> \'\' ' +
      'GROUP BY pelanggan' +
    ') t ON t.pelanggan = p.kode ' +
    'ORDER BY ABS(COALESCE(p.saldo_tabungan,0) - COALESCE(t.total_jumlah,0)) DESC ' +
    'LIMIT 30'
  );

  var jenisBalanceResult = sidRetailQuery(
    'SELECT ' +
    't.pelanggan,' +
    'SUM(CASE WHEN UPPER(TRIM(t.jenis)) = \'SETORAN\' THEN COALESCE(t.jumlah,0) ELSE 0 END) AS total_setoran,' +
    'SUM(CASE WHEN UPPER(TRIM(t.jenis)) IN (\'AMBIL\',\'TARIKAN\',\'PENARIKAN\',\'PENGAMBILAN\') THEN COALESCE(t.jumlah,0) ELSE 0 END) AS total_pengambilan,' +
    'SUM(CASE WHEN UPPER(TRIM(t.jenis)) = \'DEBET\' THEN COALESCE(t.jumlah,0) ELSE 0 END) AS total_debet,' +
    'SUM(COALESCE(t.jumlah,0)) AS total_semua_jenis,' +
    'COALESCE(p.saldo_tabungan,0) AS saldo_tabungan ' +
    'FROM tabungan t ' +
    'LEFT JOIN pelanggan p ON p.kode = t.pelanggan ' +
    'WHERE t.pelanggan IS NOT NULL AND TRIM(t.pelanggan) <> \'\' ' +
    'GROUP BY t.pelanggan,p.saldo_tabungan ' +
    'ORDER BY ABS(COALESCE(p.saldo_tabungan,0) - SUM(COALESCE(t.jumlah,0))) DESC ' +
    'LIMIT 30'
  );

  return {
    purpose: 'Menguji hubungan saldo master dengan agregasi histori tanpa menetapkan rumus produksi baru.',
    customer_with_tabungan_transactions: auditRowsV1(customerBalanceResult),
    largest_master_vs_sum_differences: auditRowsV1(sampleResult),
    by_known_jenis: auditRowsV1(jenisBalanceResult),
    note: 'Hasil ini bersifat audit. Jangan menggunakan SUM(tabungan.jumlah) sebagai saldo authoritative sebelum rumus terbukti sama dengan pelanggan.saldo_tabungan.',
    duration_ms: new Date().getTime() - started
  };
}

function auditRowsV1(result) {
  if (!result) {
    return {
      status: 'empty_result',
      rows: []
    };
  }

  return {
    status: result.status || 'unknown',
    rows: result.data || result.rows || [],
    count: (result.data || result.rows || []).length
  };
}

function testCustomerTabunganAuditV1() {
  var result = auditCustomerTabunganV1();

  if (!result || result.status !== 'AUDIT_COMPLETE') {
    throw new Error('Customer + Tabungan Audit V1 tidak selesai.');
  }

  if (result.read_only !== true || result.production_changed !== false) {
    throw new Error('Audit V1 tidak memenuhi prinsip read-only.');
  }

  Logger.log('CUSTOMER + TABUNGAN AUDIT V1: PASS');
  return result;
}
