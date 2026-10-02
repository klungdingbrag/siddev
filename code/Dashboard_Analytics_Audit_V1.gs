/**
 * TB NUSANTARA - DASHBOARD ANALYTICS AUDIT V1
 * ============================================================
 * READ-ONLY / ISOLATED
 *
 * Tujuan:
 * 1. Memetakan sumber data omzet/penjualan harian SID Retail.
 * 2. Memetakan struktur yang diperlukan untuk laba bulanan.
 * 3. Tidak mengubah Code.gs existing.
 * 4. Tidak INSERT / UPDATE / DELETE.
 *
 * CATATAN:
 * - Fungsi manual sengaja TANPA suffix "_" agar muncul di
 *   dropdown Run Apps Script.
 * - Helper internal boleh menggunakan suffix "_".
 * - File ini belum menjadi API Dashboard produksi.
 * ============================================================
 */

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
