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
/**
 * Audit gabungan satu klik.
 * Jika execution terlalu panjang, jalankan dua fungsi di atas
 * secara terpisah.
 */
/**
 * DESCRIBE / SHOW COLUMNS kompatibel dengan beberapa implementasi
 * SQL gateway. Jika SHOW COLUMNS tidak tersedia, fallback ke
 * SELECT * LIMIT 1 agar audit tetap informatif.
 */
const DASHBOARD_PROFIT_AUDIT_V1_CONFIG = {
  sourceTable: 'labarugi',
  tanggalAwal: '2026-09-01',
  tanggalAkhir: '2026-09-30'
};

