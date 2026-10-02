/**
 * TB NUSANTARA - DASHBOARD ANALYTICS V1
 * ============================================================
 * CONSOLIDATED DASHBOARD ANALYTICS MODULE
 *
 * Isi file:
 *   1. Dashboard Analytics V1 - fungsi yang akan dipakai API.
 *   2. Sales/Profit Audit V1 - fungsi audit dan rekonsiliasi.
 *
 * Prinsip:
 *   - READ-ONLY terhadap SID Retail.
 *   - Tidak mengubah Code.gs existing.
 *   - Tidak INSERT / UPDATE / DELETE.
 *   - SID Retail tetap menjadi source of truth.
 *
 * Mapping yang sudah tervalidasi:
 *   Omzet harian  -> penjualan.jumlah
 *   Laba bulanan  -> SUM(labarugi.labarugi)
 *
 * Catatan:
 *   Fungsi audit tetap dipertahankan agar rekonsiliasi dapat diulang
 *   ketika diperlukan. Fungsi manual sengaja TANPA suffix "_" agar
 *   muncul pada dropdown Run Apps Script. Helper internal boleh
 *   menggunakan suffix "_".
 * ============================================================
 */

const DASHBOARD_ANALYTICS_V1_CONFIG = {
  maxDays: 370,
  profitSourceTable: 'labarugi'
};

function getDashboardSalesDaily_V1(tanggalAwal, tanggalAkhir) {
  const started = Date.now();

  const start = dashboardAnalyticsValidateDate_V1_(tanggalAwal, 'tanggalAwal');
  const end = dashboardAnalyticsValidateDate_V1_(tanggalAkhir, 'tanggalAkhir');

  if (start > end) {
    throw new Error('tanggalAwal tidak boleh lebih besar dari tanggalAkhir.');
  }

  const dayCount = dashboardAnalyticsDaysBetween_V1_(start, end);

  if (dayCount > DASHBOARD_ANALYTICS_V1_CONFIG.maxDays) {
    throw new Error(
      'Periode terlalu panjang. Maksimum ' +
      DASHBOARD_ANALYTICS_V1_CONFIG.maxDays + ' hari per request.'
    );
  }

  const query =
    'SELECT DATE(tanggal) AS tanggal,' +
    'COUNT(*) AS jumlah_transaksi,' +
    'SUM(jumlah) AS total_omzet ' +
    'FROM penjualan ' +
    "WHERE tanggal >= '" + start + " 00:00:00' " +
    "AND tanggal < DATE_ADD('" + end + "', INTERVAL 1 DAY) " +
    'GROUP BY DATE(tanggal) ' +
    'ORDER BY DATE(tanggal) ASC';

  const result = dashboardAnalyticsQuery_V1_(query);
  const rows = Array.isArray(result.data) ? result.data : [];

  const data = rows.map(function(row) {
    return {
      tanggal: dashboardAnalyticsNormalizeDate_V1_(row.tanggal),
      jumlah_transaksi: dashboardAnalyticsNumber_V1_(row.jumlah_transaksi),
      total_omzet: dashboardAnalyticsMoney_V1_(row.total_omzet)
    };
  });

  let totalOmzet = 0;
  let totalTransaksi = 0;

  data.forEach(function(row) {
    totalOmzet += row.total_omzet;
    totalTransaksi += row.jumlah_transaksi;
  });

  return {
    status: 'success',
    analytics_version: 'v1',
    metric: 'omzet_penjualan_harian',
    definition:
      'Total aktivitas penjualan berdasarkan penjualan.jumlah pada tanggal transaksi.',
    period: {
      tanggal_awal: start,
      tanggal_akhir: end,
      jumlah_hari: dayCount
    },
    summary: {
      total_omzet: totalOmzet,
      total_transaksi: totalTransaksi,
      jumlah_hari_berdata: data.length
    },
    data: data,
    query_metadata: {
      source_table: 'penjualan',
      amount_field: 'jumlah',
      aggregation: 'SUM(jumlah)',
      date_field: 'tanggal'
    },
    duration_ms: Date.now() - started
  };
}


function getDashboardProfitMonthly_V1(tanggalAwal, tanggalAkhir) {
  const started = Date.now();

  const start = dashboardAnalyticsValidateDate_V1_(tanggalAwal, 'tanggalAwal');
  const end = dashboardAnalyticsValidateDate_V1_(tanggalAkhir, 'tanggalAkhir');

  if (start > end) {
    throw new Error('tanggalAwal tidak boleh lebih besar dari tanggalAkhir.');
  }

  const dayCount = dashboardAnalyticsDaysBetween_V1_(start, end);

  if (dayCount > DASHBOARD_ANALYTICS_V1_CONFIG.maxDays) {
    throw new Error(
      'Periode terlalu panjang. Maksimum ' +
      DASHBOARD_ANALYTICS_V1_CONFIG.maxDays + ' hari per request.'
    );
  }

  const query =
    'SELECT DATE_FORMAT(tanggal, \'%Y-%m\') AS bulan,' +
    'SUM(labarugi) AS total_laba ' +
    'FROM labarugi ' +
    "WHERE tanggal >= '" + start + " 00:00:00' " +
    "AND tanggal < DATE_ADD('" + end + "', INTERVAL 1 DAY) " +
    'GROUP BY DATE_FORMAT(tanggal, \'%Y-%m\') ' +
    'ORDER BY DATE_FORMAT(tanggal, \'%Y-%m\') ASC';

  const result = dashboardAnalyticsQuery_V1_(query);
  const rows = Array.isArray(result.data) ? result.data : [];

  const data = rows.map(function(row) {
    return {
      bulan: dashboardAnalyticsNormalizeMonth_V1_(row.bulan),
      total_laba: dashboardAnalyticsMoney_V1_(row.total_laba)
    };
  });

  let totalLaba = 0;

  data.forEach(function(row) {
    totalLaba += row.total_laba;
  });

  return {
    status: 'success',
    analytics_version: 'v1',
    metric: 'laba_bulanan',
    definition:
      'Total laba bulanan berdasarkan SUM(labarugi.labarugi), mengikuti sumber Grafik Laba SID Retail.',
    period: {
      tanggal_awal: start,
      tanggal_akhir: end,
      jumlah_hari: dayCount
    },
    summary: {
      total_laba: dashboardAnalyticsMoney_V1_(totalLaba),
      jumlah_bulan_berdata: data.length
    },
    data: data,
    query_metadata: {
      source_table: 'labarugi',
      amount_field: 'labarugi',
      aggregation: 'SUM(labarugi)',
      date_field: 'tanggal',
      grouping: 'MONTH'
    },
    duration_ms: Date.now() - started
  };
}

function getDashboardSummary_V1(tanggalAwal, tanggalAkhir) {
  const daily = getDashboardSalesDaily_V1(tanggalAwal, tanggalAkhir);

  return {
    status: 'success',
    analytics_version: 'v1',
    period: daily.period,
    omzet: daily.summary,
    piutang: null,
    laba_bulanan: null,
    notes: [
      'Omzet berasal dari penjualan.jumlah.',
      'Piutang dan laba belum digabungkan ke summary V1 sebelum mapping masing-masing sumber selesai.'
    ],
    source: daily.query_metadata
  };
}

function inspectDashboardProfitSource_V1() {
  const started = Date.now();
  const table = DASHBOARD_ANALYTICS_V1_CONFIG.profitSourceTable;

  const schemaQuery = 'SHOW COLUMNS FROM \`' + table + '\`';
  const sampleQuery = 'SELECT * FROM \`' + table + '\` LIMIT 5';

  const schema = dashboardAnalyticsQuery_V1_(schemaQuery);
  const sample = dashboardAnalyticsQuery_V1_(sampleQuery);

  return {
    status: 'success',
    analytics_version: 'v1',
    metric: 'laba_bulanan',
    source_table: table,
    mapping_status: 'INSPECTION_ONLY',
    reason:
      'Kolom dan formula laba harus mengikuti struktur SID Retail yang terverifikasi; V1 tidak membuat formula laba sendiri.',
    schema: Array.isArray(schema.data) ? schema.data : [],
    sample: Array.isArray(sample.data) ? sample.data : [],
    duration_ms: Date.now() - started
  };
}

function testDashboardAnalytics_V1() {
  const started = Date.now();
  const tanggalAwal = '2026-09-01';
  const tanggalAkhir = '2026-09-30';

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - DASHBOARD ANALYTICS V1');
  Logger.log('READ-ONLY');
  Logger.log('PERIODE: ' + tanggalAwal + ' s/d ' + tanggalAkhir);
  Logger.log('==============================================');

  const sales = getDashboardSalesDaily_V1(tanggalAwal, tanggalAkhir);

  Logger.log('=== SALES DAILY ===');
  Logger.log(JSON.stringify(sales, null, 2));

  const profitSource = inspectDashboardProfitSource_V1();

  Logger.log('=== PROFIT SOURCE INSPECTION ===');
  Logger.log(JSON.stringify(profitSource, null, 2));

  const output = {
    status: 'PASS',
    read_only: true,
    sales: sales,
    profit_source: {
      source_table: profitSource.source_table,
      mapping_status: profitSource.mapping_status,
      schema_columns: profitSource.schema.map(function(row) {
        return row.Field || '';
      }),
      sample_count: profitSource.sample.length
    },
    duration_ms: Date.now() - started
  };

  Logger.log('==============================================');
  Logger.log('DASHBOARD ANALYTICS V1 TEST COMPLETE');
  Logger.log(JSON.stringify(output, null, 2));
  Logger.log('==============================================');

  return output;
}

function dashboardAnalyticsQuery_V1_(query) {
  if (!query) {
    throw new Error('Query Dashboard Analytics kosong.');
  }

  const result = sidRetailQuery(query);

  if (!result || result.status !== 'success') {
    throw new Error(
      'Dashboard Analytics query gagal: ' + JSON.stringify(result)
    );
  }

  return result;
}

function dashboardAnalyticsValidateDate_V1_(value, fieldName) {
  const valueText = String(value || '').trim();

  if (
    valueText.length !== 10 ||
    valueText.charAt(4) !== '-' ||
    valueText.charAt(7) !== '-'
  ) {
    throw new Error(fieldName + ' harus menggunakan format YYYY-MM-DD.');
  }

  const parts = valueText.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(fieldName + ' bukan tanggal kalender yang valid.');
  }

  return valueText;
}

function dashboardAnalyticsDaysBetween_V1_(startText, endText) {
  const start = dashboardAnalyticsDateObject_V1_(startText);
  const end = dashboardAnalyticsDateObject_V1_(endText);

  return Math.floor(
    (end.getTime() - start.getTime()) / 86400000
  ) + 1;
}

function dashboardAnalyticsDateObject_V1_(value) {
  const parts = String(value).split('-');

  return new Date(Date.UTC(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2])
  ));
}

function dashboardAnalyticsNormalizeDate_V1_(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value).trim();

  if (text.length >= 10 && text.charAt(4) === '-' && text.charAt(7) === '-') {
    return text.substring(0, 10);
  }

  return text;
}


function dashboardAnalyticsNormalizeMonth_V1_(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value).trim();

  if (text.length === 7 && text.charAt(4) === '-') {
    return text;
  }

  return text;
}

function dashboardAnalyticsNumber_V1_(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const number = Number(String(value).replace(/,/g, ''));
  return isFinite(number) ? number : 0;
}

function dashboardAnalyticsMoney_V1_(value) {
  return Math.round(
    dashboardAnalyticsNumber_V1_(value) * 100
  ) / 100;
}


/* ============================================================
 * SALES / PROFIT AUDIT UTILITIES
 * Digabung dari:
 *   Dashboard_Analytics_Audit_V1.gs
 *   Dashboard_Profit_Audit_V1.gs
 * ============================================================ */

const DASHBOARD_AUDIT_CONFIG = {
  sampleLimit: 5,
  dailyLimit: 120,
  candidateTables: [
    'penjualan',
    'itempenjualan',
    'pembelian',
    'itempembelian',
    'pengeluaran',
    'returpenjualan',
    'itemreturpenjualan'
  ]
};

/**
 * Audit utama: struktur tabel + contoh agregasi penjualan harian.
 *
 * Jalankan setelah file ini berada di Development GAS.
 */
function testDashboardSalesMapping() {
  const started = Date.now();

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - DASHBOARD SALES AUDIT V1');
  Logger.log('READ-ONLY');
  Logger.log('==============================================');

  const output = {
    status: 'success',
    audit: 'sales_mapping_v1',
    read_only: true,
    tables: {},
    daily_sales_query: null,
    duration_ms: null
  };

  output.tables.penjualan = dashboardAuditDescribeTable_('penjualan');

  // Sample transaksi dipakai untuk melihat field status/flags yang
  // benar-benar tersedia, tanpa mengasumsikan nama kolom tertentu.
  output.tables.penjualan_sample = dashboardAuditQuery_(
    'SELECT * FROM penjualan LIMIT ' +
    DASHBOARD_AUDIT_CONFIG.sampleLimit
  );

  /*
   * Agregasi ini sengaja belum diberi WHERE periode.
   * Tujuannya adalah memverifikasi:
   * - apakah GROUP BY tanggal diterima API SID,
   * - bentuk nilai tanggal,
   * - apakah SUM(jumlah) dapat dihitung langsung,
   * - jumlah transaksi per tanggal.
   *
   * Setelah mapping tervalidasi, fungsi produksi akan memakai
   * periode terparameterisasi.
   */
  const dailyQuery =
    'SELECT tanggal,COUNT(*) AS jumlah_transaksi,' +
    'SUM(jumlah) AS total_penjualan ' +
    'FROM penjualan ' +
    'GROUP BY tanggal ' +
    'ORDER BY tanggal ' +
    'DESC LIMIT ' +
    DASHBOARD_AUDIT_CONFIG.dailyLimit;

  output.daily_sales_query = {
    sql: dailyQuery,
    result: dashboardAuditQuery_(dailyQuery)
  };

  Logger.log('SALES AUDIT RESULT:');
  Logger.log(JSON.stringify(output, null, 2));

  output.duration_ms = Date.now() - started;
  return output;
}

/**
 * Audit laba:
 * - struktur penjualan
 * - struktur itempenjualan
 * - struktur pembelian/itempembelian
 * - pengeluaran
 * - retur bila tersedia
 *
 * Tidak menghitung "laba" sendiri.
 * Tujuannya justru menemukan field/sumber yang dipakai SID Retail.
 */
function testDashboardProfitMapping() {
  const started = Date.now();

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - DASHBOARD PROFIT AUDIT V1');
  Logger.log('READ-ONLY');
  Logger.log('==============================================');

  const output = {
    status: 'success',
    audit: 'profit_mapping_v1',
    read_only: true,
    tables: {},
    duration_ms: null
  };

  DASHBOARD_AUDIT_CONFIG.candidateTables.forEach(function(tableName) {
    try {
      output.tables[tableName] = dashboardAuditDescribeTable_(tableName);
    } catch (error) {
      output.tables[tableName] = {
        status: 'not_available_or_error',
        error: error && error.message ? error.message : String(error)
      };
    }
  });

  Logger.log('PROFIT STRUCTURE AUDIT RESULT:');
  Logger.log(JSON.stringify(output, null, 2));

  output.duration_ms = Date.now() - started;
  return output;
}

/**
 * Audit gabungan satu klik.
 * Jika execution terlalu panjang, jalankan dua fungsi di atas
 * secara terpisah.
 */
function testDashboardAnalyticsAudit() {
  const started = Date.now();

  const sales = testDashboardSalesMapping();
  const profit = testDashboardProfitMapping();

  const output = {
    status: 'success',
    audit: 'dashboard_analytics_v1',
    read_only: true,
    sales: sales,
    profit: profit,
    duration_ms: Date.now() - started
  };

  Logger.log('==============================================');
  Logger.log('DASHBOARD ANALYTICS AUDIT COMPLETE');
  Logger.log(JSON.stringify(output, null, 2));
  Logger.log('==============================================');

  return output;
}

/**
 * DESCRIBE / SHOW COLUMNS kompatibel dengan beberapa implementasi
 * SQL gateway. Jika SHOW COLUMNS tidak tersedia, fallback ke
 * SELECT * LIMIT 1 agar audit tetap informatif.
 */
function dashboardAuditDescribeTable_(tableName) {
  const safeTable = dashboardAuditValidateIdentifier_(tableName);

  const queries = [
    'SHOW COLUMNS FROM ' + safeTable,
    'DESCRIBE ' + safeTable
  ];

  let lastError = null;

  for (let i = 0; i < queries.length; i++) {
    try {
      return {
        status: 'success',
        table: safeTable,
        query: queries[i],
        result: dashboardAuditQuery_(queries[i])
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    status: 'fallback_sample',
    table: safeTable,
    error: lastError && lastError.message
      ? lastError.message
      : String(lastError || 'schema query gagal'),
    sample: dashboardAuditQuery_(
      'SELECT * FROM ' + safeTable +
      ' LIMIT ' + DASHBOARD_AUDIT_CONFIG.sampleLimit
    )
  };
}

function dashboardAuditQuery_(query) {
  const result = sidRetailQuery(query);

  if (!result || result.status !== 'success') {
    throw new Error(
      'SID query gagal: ' + JSON.stringify(result)
    );
  }

  return {
    status: 'success',
    row_count: Array.isArray(result.data) ? result.data.length : 0,
    data: Array.isArray(result.data) ? result.data : []
  };
}

function dashboardAuditValidateIdentifier_(name) {
  const value = String(name || '').trim();

  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error('Identifier tabel tidak valid: ' + value);
  }

  return value;
}


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
