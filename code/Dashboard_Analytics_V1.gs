/**
 * TB NUSANTARA - DASHBOARD ANALYTICS V1
 * ============================================================
 * ISOLATED BACKEND MODULE / READ ONLY
 *
 * Confirmed source:
 *   penjualan.jumlah = nilai total transaksi/invoice.
 *
 * Dashboard omzet:
 *   aktivitas penjualan berdasarkan tanggal transaksi,
 *   tanpa filter piutang/lunas/cetak.
 *
 * Profit:
 *   SID Retail memiliki tabel labarugi dan menu Laporan Laba Rugi/
 *   Grafik, tetapi formula/kolom sumber laba belum cukup terverifikasi.
 *   V1 hanya menginspeksi sumber tersebut dan TIDAK membuat formula
 *   laba sendiri.
 *
 * Fungsi manual TANPA suffix "_" agar muncul di dropdown Run GAS.
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

  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(valueText)) {
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

  if (/^\\d{4}-\\d{2}-\\d{2}/.test(text)) {
    return text.substring(0, 10);
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
