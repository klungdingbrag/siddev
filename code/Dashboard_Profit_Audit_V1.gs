/**
 * TB NUSANTARA - DASHBOARD PROFIT AUDIT V1
 * ============================================================
 * ISOLATED BACKEND MODULE / READ ONLY
 *
 * Tujuan:
 *   Memetakan sumber laba SID Retail tanpa membuat formula laba
 *   sendiri dan tanpa mengubah Code.gs.
 *
 * Fokus audit:
 *   1. Nilai agregat labarugi untuk periode September 2026.
 *   2. Konsistensi internal:
 *        penjualan - hpp - diskon = labarugi
 *   3. Breakdown berdasarkan keterangan.
 *   4. Breakdown laba harian untuk rekonsiliasi dengan grafik POS.
 *   5. Sample data dari periode yang sama, bukan LIMIT historis.
 *
 * Catatan:
 *   Audit ini belum menyatakan bahwa SUM(labarugi) pasti sama dengan
 *   angka Grafik Laba POS sebelum hasilnya direkonsiliasi dengan POS.
 *
 * Fungsi manual TANPA suffix "_" agar muncul di dropdown Run GAS.
 * ============================================================
 */

const DASHBOARD_PROFIT_AUDIT_V1_CONFIG = {
  sourceTable: 'labarugi',
  tanggalAwal: '2026-09-01',
  tanggalAkhir: '2026-09-30'
};

function auditDashboardProfitSeptember_V1() {
  const started = Date.now();
  const start = DASHBOARD_PROFIT_AUDIT_V1_CONFIG.tanggalAwal;
  const end = DASHBOARD_PROFIT_AUDIT_V1_CONFIG.tanggalAkhir;

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - DASHBOARD PROFIT AUDIT V1');
  Logger.log('READ-ONLY');
  Logger.log('SUMBER: ' + DASHBOARD_PROFIT_AUDIT_V1_CONFIG.sourceTable);
  Logger.log('PERIODE: ' + start + ' s/d ' + end);
  Logger.log('==============================================');

  const aggregate = auditDashboardProfitAggregate_V1_(start, end);
  const breakdown = auditDashboardProfitBreakdown_V1_(start, end);
  const daily = auditDashboardProfitDaily_V1_(start, end);
  const sample = auditDashboardProfitSample_V1_(start, end);

  Logger.log('=== PROFIT AGGREGATE ===');
  Logger.log(JSON.stringify(aggregate, null, 2));

  Logger.log('=== BREAKDOWN KETERANGAN ===');
  Logger.log(JSON.stringify(breakdown, null, 2));

  Logger.log('=== PROFIT DAILY ===');
  Logger.log(JSON.stringify(daily, null, 2));

  Logger.log('=== PERIOD SAMPLE ===');
  Logger.log(JSON.stringify(sample, null, 2));

  const output = {
    status: 'PASS',
    read_only: true,
    source_table: DASHBOARD_PROFIT_AUDIT_V1_CONFIG.sourceTable,
    period: {
      tanggal_awal: start,
      tanggal_akhir: end
    },
    aggregate: aggregate,
    breakdown_keterangan: breakdown,
    daily: daily,
    sample: sample,
    duration_ms: Date.now() - started,
    next_validation:
      'Rekonsiliasi angka laba agregat/periode ini dengan Grafik Laba POS sebelum formula Dashboard dikunci.'
  };

  Logger.log('==============================================');
  Logger.log('DASHBOARD PROFIT AUDIT V1 COMPLETE');
  Logger.log(JSON.stringify(output, null, 2));
  Logger.log('==============================================');

  return output;
}

function auditDashboardProfitAggregate_V1_(tanggalAwal, tanggalAkhir) {
  const query =
    'SELECT ' +
    'COUNT(*) AS jumlah_baris,' +
    'COUNT(DISTINCT kode) AS jumlah_transaksi,' +
    'SUM(penjualan) AS total_penjualan,' +
    'SUM(hpp) AS total_hpp,' +
    'SUM(diskon) AS total_diskon,' +
    'SUM(labarugi) AS total_labarugi,' +
    'SUM((penjualan - hpp - diskon) - labarugi) AS selisih_formula ' +
    'FROM labarugi ' +
    "WHERE tanggal >= '" + tanggalAwal + " 00:00:00' " +
    "AND tanggal < DATE_ADD('" + tanggalAkhir + "', INTERVAL 1 DAY)";

  const result = dashboardProfitAuditQuery_V1_(query);
  const row = Array.isArray(result.data) && result.data.length
    ? result.data[0]
    : {};

  const totalPenjualan = dashboardProfitAuditNumber_V1_(row.total_penjualan);
  const totalHpp = dashboardProfitAuditNumber_V1_(row.total_hpp);
  const totalDiskon = dashboardProfitAuditNumber_V1_(row.total_diskon);
  const totalLabarugi = dashboardProfitAuditNumber_V1_(row.total_labarugi);
  const calculatedLabarugi = totalPenjualan - totalHpp - totalDiskon;
  const selisihAgregat = calculatedLabarugi - totalLabarugi;

  return {
    jumlah_baris: dashboardProfitAuditNumber_V1_(row.jumlah_baris),
    jumlah_transaksi: dashboardProfitAuditNumber_V1_(row.jumlah_transaksi),
    total_penjualan: dashboardProfitAuditMoney_V1_(totalPenjualan),
    total_hpp: dashboardProfitAuditMoney_V1_(totalHpp),
    total_diskon: dashboardProfitAuditMoney_V1_(totalDiskon),
    total_labarugi: dashboardProfitAuditMoney_V1_(totalLabarugi),
    calculated_labarugi: dashboardProfitAuditMoney_V1_(calculatedLabarugi),
    selisih_agregat: dashboardProfitAuditMoney_V1_(selisihAgregat),
    formula_internal:
      'SUM(penjualan) - SUM(hpp) - SUM(diskon) dibandingkan dengan SUM(labarugi)',
    duration_ms: result.duration_ms || null
  };
}

function auditDashboardProfitBreakdown_V1_(tanggalAwal, tanggalAkhir) {
  const query =
    'SELECT ' +
    'COALESCE(keterangan, \'\') AS keterangan,' +
    'COUNT(*) AS jumlah_baris,' +
    'COUNT(DISTINCT kode) AS jumlah_transaksi,' +
    'SUM(penjualan) AS total_penjualan,' +
    'SUM(hpp) AS total_hpp,' +
    'SUM(diskon) AS total_diskon,' +
    'SUM(labarugi) AS total_labarugi ' +
    'FROM labarugi ' +
    "WHERE tanggal >= '" + tanggalAwal + " 00:00:00' " +
    "AND tanggal < DATE_ADD('" + tanggalAkhir + "', INTERVAL 1 DAY) " +
    'GROUP BY keterangan ' +
    'ORDER BY total_labarugi DESC';

  const result = dashboardProfitAuditQuery_V1_(query);
  const rows = Array.isArray(result.data) ? result.data : [];

  return rows.map(function(row) {
    return {
      keterangan: String(row.keterangan || ''),
      jumlah_baris: dashboardProfitAuditNumber_V1_(row.jumlah_baris),
      jumlah_transaksi: dashboardProfitAuditNumber_V1_(row.jumlah_transaksi),
      total_penjualan: dashboardProfitAuditMoney_V1_(row.total_penjualan),
      total_hpp: dashboardProfitAuditMoney_V1_(row.total_hpp),
      total_diskon: dashboardProfitAuditMoney_V1_(row.total_diskon),
      total_labarugi: dashboardProfitAuditMoney_V1_(row.total_labarugi)
    };
  });
}

function auditDashboardProfitDaily_V1_(tanggalAwal, tanggalAkhir) {
  const query =
    'SELECT ' +
    'DATE(tanggal) AS tanggal,' +
    'COUNT(*) AS jumlah_baris,' +
    'COUNT(DISTINCT kode) AS jumlah_transaksi,' +
    'SUM(penjualan) AS total_penjualan,' +
    'SUM(hpp) AS total_hpp,' +
    'SUM(diskon) AS total_diskon,' +
    'SUM(labarugi) AS total_labarugi ' +
    'FROM labarugi ' +
    "WHERE tanggal >= '" + tanggalAwal + " 00:00:00' " +
    "AND tanggal < DATE_ADD('" + tanggalAkhir + "', INTERVAL 1 DAY) " +
    'GROUP BY DATE(tanggal) ' +
    'ORDER BY DATE(tanggal) ASC';

  const result = dashboardProfitAuditQuery_V1_(query);
  const rows = Array.isArray(result.data) ? result.data : [];

  return rows.map(function(row) {
    return {
      tanggal: dashboardProfitAuditNormalizeDate_V1_(row.tanggal),
      jumlah_baris: dashboardProfitAuditNumber_V1_(row.jumlah_baris),
      jumlah_transaksi: dashboardProfitAuditNumber_V1_(row.jumlah_transaksi),
      total_penjualan: dashboardProfitAuditMoney_V1_(row.total_penjualan),
      total_hpp: dashboardProfitAuditMoney_V1_(row.total_hpp),
      total_diskon: dashboardProfitAuditMoney_V1_(row.total_diskon),
      total_labarugi: dashboardProfitAuditMoney_V1_(row.total_labarugi)
    };
  });
}

function auditDashboardProfitSample_V1_(tanggalAwal, tanggalAkhir) {
  const query =
    'SELECT ' +
    'tanggal,kode,kode_barang,nama_barang,penjualan,hpp,diskon,labarugi,keterangan,pelanggan,nama_pelanggan ' +
    'FROM labarugi ' +
    "WHERE tanggal >= '" + tanggalAwal + " 00:00:00' " +
    "AND tanggal < DATE_ADD('" + tanggalAkhir + "', INTERVAL 1 DAY) " +
    'ORDER BY tanggal DESC, kode DESC ' +
    'LIMIT 10';

  const result = dashboardProfitAuditQuery_V1_(query);
  return Array.isArray(result.data) ? result.data : [];
}

function dashboardProfitAuditQuery_V1_(query) {
  if (!query) {
    throw new Error('Query Dashboard Profit Audit kosong.');
  }

  const result = sidRetailQuery(query);

  if (!result || result.status !== 'success') {
    throw new Error(
      'Dashboard Profit Audit query gagal: ' + JSON.stringify(result)
    );
  }

  return result;
}

function dashboardProfitAuditNumber_V1_(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const number = Number(String(value).replace(/,/g, ''));
  return isFinite(number) ? number : 0;
}

function dashboardProfitAuditMoney_V1_(value) {
  return Math.round(
    dashboardProfitAuditNumber_V1_(value) * 100
  ) / 100;
}

function dashboardProfitAuditNormalizeDate_V1_(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value).trim();

  if (text.length >= 10 && text.charAt(4) === '-' && text.charAt(7) === '-') {
    return text.substring(0, 10);
  }

  return text;
}
