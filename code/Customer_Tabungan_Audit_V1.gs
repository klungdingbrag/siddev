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
  Logger.log('CUSTOMER MASTER');
  Logger.log(JSON.stringify(result.customer, null, 2));
  Logger.log('TABUNGAN SOURCE');
  Logger.log(JSON.stringify(result.tabungan, null, 2));
  Logger.log('SALDO VALIDATION');
  Logger.log(JSON.stringify(result.saldo_validation, null, 2));
  Logger.log('==============================================');
  Logger.log('FOKUS FIKA 2606030');
  Logger.log(JSON.stringify(auditCustomerFikaV1(), null, 2));
  Logger.log('==============================================');
  Logger.log('AUDIT DEBET');
  Logger.log(JSON.stringify(auditTabunganDebetV1(), null, 2));
  Logger.log('==============================================');
  Logger.log('HISTORI CUSTOMER DEBET');
  Logger.log(JSON.stringify(auditDebetCustomerHistoryV1(), null, 2));
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

function auditDebetCustomerHistoryV1() {
  var started = new Date().getTime();

  var result = sidRetailQuery(
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,keterangan,kode_kas,sumber,sumber_faktur ' +
    'FROM tabungan ' +
    'WHERE pelanggan IN (\'2108003\',\'MUSHOLA\') ' +
    'ORDER BY pelanggan ASC,tanggal ASC,jam ASC,kode ASC'
  );

  var rows = result.data || result.rows || [];
  var grouped = {};

  rows.forEach(function(row) {
    var customer = String(row.pelanggan || '').trim();
    if (!grouped[customer]) {
      grouped[customer] = {
        kode_pelanggan: customer,
        total_debet: 0,
        total_setoran: 0,
        total_ambil: 0,
        total_lainnya: 0,
        transaksi: []
      };
    }

    var item = grouped[customer];
    var jumlah = Number(row.jumlah || 0);
    var jenis = String(row.jenis || '').trim().toUpperCase();

    if (jenis === 'DEBET') {
      item.total_debet += jumlah;
    } else if (jenis === 'SETORAN') {
      item.total_setoran += jumlah;
    } else if (jenis === 'AMBIL' || jenis === 'TARIKAN' || jenis === 'PENARIKAN' || jenis === 'PENGAMBILAN') {
      item.total_ambil += jumlah;
    } else {
      item.total_lainnya += jumlah;
    }

    item.transaksi.push({
      kode: String(row.kode || ''),
      tanggal: String(row.tanggal || ''),
      jam: String(row.jam || ''),
      jumlah: jumlah,
      jenis: jenis,
      keterangan: String(row.keterangan || '')
    });
  });

  var customerCodes = Object.keys(grouped);
  customerCodes.forEach(function(kode) {
    var item = grouped[kode];
    item.saldo_setoran_minus_ambil = item.total_setoran - item.total_ambil;
    item.saldo_plus_debet = item.total_setoran - item.total_ambil + item.total_debet;
    item.saldo_minus_debet = item.total_setoran - item.total_ambil - item.total_debet;
  });

  var masterResult = sidRetailQuery(
    'SELECT kode,nama,COALESCE(saldo_tabungan,0) AS saldo_tabungan ' +
    'FROM pelanggan ' +
    'WHERE kode IN (\'2108003\',\'MUSHOLA\') ' +
    'ORDER BY kode ASC'
  );

  var masterRows = masterResult.data || masterResult.rows || [];
  var masterMap = {};
  masterRows.forEach(function(row) {
    masterMap[String(row.kode || '').trim()] = {
      kode_pelanggan: String(row.kode || '').trim(),
      nama: String(row.nama || '').trim(),
      saldo_tabungan: Number(row.saldo_tabungan || 0)
    };
  });

  customerCodes.forEach(function(kode) {
    var item = grouped[kode];
    var master = masterMap[kode] || {
      kode_pelanggan: kode,
      nama: '',
      saldo_tabungan: 0
    };

    item.nama = master.nama;
    item.saldo_master = master.saldo_tabungan;
    item.selisih_dengan_setoran_minus_ambil =
      master.saldo_tabungan - item.saldo_setoran_minus_ambil;
    item.selisih_dengan_plus_debet =
      master.saldo_tabungan - item.saldo_plus_debet;
    item.selisih_dengan_minus_debet =
      master.saldo_tabungan - item.saldo_minus_debet;
  });

  Logger.log('==============================================');
  Logger.log('HISTORI CUSTOMER DEBET');
  Logger.log('==============================================');

  customerCodes.forEach(function(kode) {
    var item = grouped[kode];

    Logger.log('CUSTOMER: ' + item.kode_pelanggan + ' - ' + item.nama);
    Logger.log('SALDO MASTER: Rp ' + item.saldo_master.toLocaleString('id-ID'));
    Logger.log('TOTAL DEBET: Rp ' + item.total_debet.toLocaleString('id-ID'));
    Logger.log('TOTAL SETORAN: Rp ' + item.total_setoran.toLocaleString('id-ID'));
    Logger.log('TOTAL AMBIL: Rp ' + item.total_ambil.toLocaleString('id-ID'));
    Logger.log('SALDO SETORAN - AMBIL: Rp ' + item.saldo_setoran_minus_ambil.toLocaleString('id-ID'));
    Logger.log('SALDO + DEBET: Rp ' + item.saldo_plus_debet.toLocaleString('id-ID'));
    Logger.log('SALDO - DEBET: Rp ' + item.saldo_minus_debet.toLocaleString('id-ID'));
    Logger.log('SELISIH MASTER vs SETORAN-AMBIL: Rp ' + item.selisih_dengan_setoran_minus_ambil.toLocaleString('id-ID'));
    Logger.log('SELISIH MASTER vs +DEBET: Rp ' + item.selisih_dengan_plus_debet.toLocaleString('id-ID'));
    Logger.log('SELISIH MASTER vs -DEBET: Rp ' + item.selisih_dengan_minus_debet.toLocaleString('id-ID'));

    item.transaksi.forEach(function(tx) {
      Logger.log(
        tx.tanggal + ' | ' +
        tx.jam + ' | ' +
        tx.jenis + ' | Rp ' +
        tx.jumlah.toLocaleString('id-ID') + ' | ' +
        tx.kode + ' | ' +
        tx.keterangan
      );
    });

    Logger.log('----------------------------------------------');
  });

  return {
    purpose: 'Verifikasi akhir perlakuan DEBET terhadap saldo_tabungan tanpa mengubah production.',
    customers: grouped,
    duration_ms: new Date().getTime() - started
  };
}


function auditTabunganDebetV1() {
  var started = new Date().getTime();

  var debetResult = sidRetailQuery(
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,keterangan,kode_kas,sumber,sumber_faktur ' +
    'FROM tabungan ' +
    'WHERE UPPER(TRIM(jenis)) = \'DEBET\' ' +
    'ORDER BY tanggal ASC,jam ASC,kode ASC'
  );

  var comparisonResult = sidRetailQuery(
    'SELECT ' +
    'p.kode,p.nama,COALESCE(p.saldo_tabungan,0) AS saldo_tabungan,' +
    'COALESCE(SUM(CASE WHEN UPPER(TRIM(t.jenis)) = \'SETORAN\' THEN COALESCE(t.jumlah,0) ELSE 0 END),0) AS total_setoran,' +
    'COALESCE(SUM(CASE WHEN UPPER(TRIM(t.jenis)) IN (\'AMBIL\',\'TARIKAN\',\'PENARIKAN\',\'PENGAMBILAN\') THEN COALESCE(t.jumlah,0) ELSE 0 END),0) AS total_pengambilan,' +
    'COALESCE(SUM(CASE WHEN UPPER(TRIM(t.jenis)) = \'DEBET\' THEN COALESCE(t.jumlah,0) ELSE 0 END),0) AS total_debet,' +
    'COALESCE(SUM(CASE WHEN UPPER(TRIM(t.jenis)) = \'SETORAN\' THEN COALESCE(t.jumlah,0) ELSE 0 END),0) - ' +
    'COALESCE(SUM(CASE WHEN UPPER(TRIM(t.jenis)) IN (\'AMBIL\',\'TARIKAN\',\'PENARIKAN\',\'PENGAMBILAN\') THEN COALESCE(t.jumlah,0) ELSE 0 END),0) AS saldo_setoran_minus_ambil,' +
    'COALESCE(SUM(CASE WHEN UPPER(TRIM(t.jenis)) = \'SETORAN\' THEN COALESCE(t.jumlah,0) ELSE 0 END),0) - ' +
    'COALESCE(SUM(CASE WHEN UPPER(TRIM(t.jenis)) IN (\'AMBIL\',\'TARIKAN\',\'PENARIKAN\',\'PENGAMBILAN\') THEN COALESCE(t.jumlah,0) ELSE 0 END),0) + ' +
    'COALESCE(SUM(CASE WHEN UPPER(TRIM(t.jenis)) = \'DEBET\' THEN COALESCE(t.jumlah,0) ELSE 0 END),0) AS saldo_plus_debet,' +
    'COALESCE(SUM(CASE WHEN UPPER(TRIM(t.jenis)) = \'SETORAN\' THEN COALESCE(t.jumlah,0) ELSE 0 END),0) - ' +
    'COALESCE(SUM(CASE WHEN UPPER(TRIM(t.jenis)) IN (\'AMBIL\',\'TARIKAN\',\'PENARIKAN\',\'PENGAMBILAN\') THEN COALESCE(t.jumlah,0) ELSE 0 END),0) - ' +
    'COALESCE(SUM(CASE WHEN UPPER(TRIM(t.jenis)) = \'DEBET\' THEN COALESCE(t.jumlah,0) ELSE 0 END),0) AS saldo_minus_debet ' +
    'FROM pelanggan p ' +
    'INNER JOIN tabungan t ON t.pelanggan = p.kode ' +
    'WHERE UPPER(TRIM(t.jenis)) = \'DEBET\' ' +
    'GROUP BY p.kode,p.nama,p.saldo_tabungan ' +
    'ORDER BY p.kode ASC'
  );

  return {
    purpose: 'Menentukan perlakuan transaksi DEBET terhadap saldo_tabungan tanpa mengubah production.',
    debet_transactions: auditRowsV1(debetResult),
    customer_comparison: auditRowsV1(comparisonResult),
    duration_ms: new Date().getTime() - started
  };
}

function auditCustomerFikaV1() {
  var result = sidRetailQuery(
    'SELECT ' +
    'p.kode,' +
    'p.nama,' +
    'COALESCE(p.saldo_tabungan,0) AS saldo_tabungan,' +
    'COALESCE(t.jumlah_transaksi,0) AS jumlah_transaksi,' +
    'COALESCE(t.total_jumlah,0) AS total_jumlah_tabungan,' +
    'COALESCE(t.total_positif,0) AS total_positif,' +
    'COALESCE(t.total_negatif,0) AS total_negatif ' +
    'FROM pelanggan p ' +
    'LEFT JOIN (' +
      'SELECT pelanggan,COUNT(*) AS jumlah_transaksi,' +
      'SUM(COALESCE(jumlah,0)) AS total_jumlah,' +
      'SUM(CASE WHEN COALESCE(jumlah,0) > 0 THEN jumlah ELSE 0 END) AS total_positif,' +
      'SUM(CASE WHEN COALESCE(jumlah,0) < 0 THEN jumlah ELSE 0 END) AS total_negatif ' +
      'FROM tabungan ' +
      'WHERE pelanggan = \'2606030\' ' +
      'GROUP BY pelanggan' +
    ') t ON t.pelanggan = p.kode ' +
    'WHERE p.kode = \'2606030\' ' +
    'LIMIT 1'
  );

  var transactionResult = sidRetailQuery(
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,keterangan,kode_kas,sumber,sumber_faktur ' +
    'FROM tabungan ' +
    'WHERE pelanggan = \'2606030\' ' +
    'ORDER BY tanggal ASC,jam ASC,kode ASC'
  );

  return {
    customer_master: auditRowsV1(result),
    transactions: auditRowsV1(transactionResult),
    note: 'FIKA dipakai sebagai customer pembanding karena test Production Tabungan V1 sebelumnya mengharapkan Rp97.000.000 sementara saldo master SID Retail terbaca Rp92.000.000.'
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
function auditCustomerPiutangV1() {
  var started = new Date().getTime();

  var master = sidRetailQuery(
    'SELECT kode,nama,COALESCE(saldo_tabungan,0) AS saldo_tabungan,COALESCE(saldo_piutang,0) AS saldo_piutang ' +
    'FROM pelanggan ORDER BY kode ASC'
  );
  var masterRows = master.data || master.rows || [];

  var piutang = sidRetailQuery(
    'SELECT pelanggan,COUNT(*) AS jumlah_transaksi,SUM(COALESCE(piutang,0)) AS total_piutang ' +
    'FROM penjualan ' +
    'WHERE pelanggan IS NOT NULL AND TRIM(pelanggan) <> \'\' ' +
    'GROUP BY pelanggan ORDER BY pelanggan ASC'
  );
  var piutangRows = piutang.data || piutang.rows || [];

  var masterMap = {};
  masterRows.forEach(function(row) {
    var kode = String(row.kode || '').trim();
    if (kode) {
      masterMap[kode] = {
        kode_pelanggan: kode,
        nama: String(row.nama || '').trim(),
        saldo_tabungan: Number(row.saldo_tabungan || 0),
        saldo_piutang_master: Number(row.saldo_piutang || 0)
      };
    }
  });

  var piutangMap = {};
  piutangRows.forEach(function(row) {
    var kode = String(row.pelanggan || '').trim();
    if (kode) {
      piutangMap[kode] = {
        jumlah_transaksi: Number(row.jumlah_transaksi || 0),
        total_piutang_penjualan: Number(row.total_piutang || 0)
      };
    }
  });

  var onlyTabungan = [];
  var onlyPiutang = [];
  var both = [];
  var neither = [];
  var piutangMismatch = [];

  Object.keys(masterMap).forEach(function(kode) {
    var m = masterMap[kode];
    var p = piutangMap[kode] || {jumlah_transaksi: 0, total_piutang_penjualan: 0};
    var hasTabungan = m.saldo_tabungan > 0;
    var hasMasterPiutang = m.saldo_piutang_master > 0;
    var hasPenjualanPiutang = p.total_piutang_penjualan > 0;

    if (hasTabungan && (hasMasterPiutang || hasPenjualanPiutang)) {
      both.push(kode);
    } else if (hasTabungan) {
      onlyTabungan.push(kode);
    } else if (hasMasterPiutang || hasPenjualanPiutang) {
      onlyPiutang.push(kode);
    } else {
      neither.push(kode);
    }

    if (Math.abs(m.saldo_piutang_master - p.total_piutang_penjualan) > 0.01) {
      piutangMismatch.push({
        kode_pelanggan: kode,
        nama: m.nama,
        saldo_piutang_master: m.saldo_piutang_master,
        total_piutang_penjualan: p.total_piutang_penjualan,
        selisih: m.saldo_piutang_master - p.total_piutang_penjualan,
        jumlah_transaksi_piutang_source: p.jumlah_transaksi
      });
    }
  });

  Logger.log('==============================================');
  Logger.log('CUSTOMER + PIUTANG AUDIT V1');
  Logger.log('==============================================');
  Logger.log('CUSTOMER MASTER: ' + masterRows.length);
  Logger.log('ONLY TABUNGAN: ' + onlyTabungan.length);
  Logger.log('ONLY PIUTANG: ' + onlyPiutang.length);
  Logger.log('BOTH TABUNGAN + PIUTANG: ' + both.length);
  Logger.log('NEITHER: ' + neither.length);
  Logger.log('MASTER PIUTANG vs SUM penjualan.piutang MISMATCH: ' + piutangMismatch.length);

  Logger.log('----------------------------------------------');
  Logger.log('PIUTANG MISMATCH TERBESAR');
  piutangMismatch
    .sort(function(a, b) {
      return Math.abs(b.selisih) - Math.abs(a.selisih);
    })
    .slice(0, 30)
    .forEach(function(item) {
      Logger.log(
        item.kode_pelanggan + ' | ' + item.nama +
        ' | MASTER Rp ' + item.saldo_piutang_master.toLocaleString('id-ID') +
        ' | PENJUALAN Rp ' + item.total_piutang_penjualan.toLocaleString('id-ID') +
        ' | SELISIH Rp ' + item.selisih.toLocaleString('id-ID') +
        ' | TX ' + item.jumlah_transaksi_piutang_source
      );
    });

  return {
    source: {
      customer_master: 'pelanggan',
      piutang_transaction_source: 'penjualan.piutang'
    },
    summary: {
      customer_master: masterRows.length,
      only_tabungan: onlyTabungan.length,
      only_piutang: onlyPiutang.length,
      both_tabungan_piutang: both.length,
      neither: neither.length,
      piutang_mismatch: piutangMismatch.length
    },
    categories: {
      only_tabungan: onlyTabungan,
      only_piutang: onlyPiutang,
      both_tabungan_piutang: both,
      neither: neither
    },
    mismatches: piutangMismatch,
    duration_ms: new Date().getTime() - started
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
