/**
 * SID RETAIL — SUPPLIER PAYMENT GLOBAL DIAGNOSTIC V6
 * MODE: READ-ONLY
 *
 * Tujuan:
 * Memeriksa sampel header pembayaran kandidat, rincian alokasi itemhutang,
 * dan saldo nota supplier pada pembelian untuk audit jalur transaksi.
 *
 * Batasan:
 * - Semua SQL di bawah adalah SELECT tetap dengan LIMIT.
 * - Tidak ada INSERT, UPDATE, DELETE, atau mutasi data.
 * - Tidak memeriksa tabel/efek retur; retur ditangani server POS.
 * - Sampel tidak membuktikan kontrak tulis atau konsistensi transaksi.
 * - Jalankan hanya pada project GAS Development.
 *
 * Cara menjalankan:
 * diagnosticSupplierPaymentQueriesV6()
 *
 * Dependensi:
 * sidRetailQuery(sql) yang sudah tersedia di project GAS.
 */
function diagnosticSupplierPaymentQueriesV6() {
  var startedAt = new Date().toISOString();
  var queries = [
    {
      name: 'PAYMENT_HEADER_TABLE_SAMPLE',
      purpose: 'Inspect candidate payment header fields without assuming a write contract.',
      sql: 'SELECT * FROM hutang LIMIT 20'
    },
    {
      name: 'PAYMENT_ALLOCATION_TABLE_SAMPLE',
      purpose: 'Inspect invoice allocation rows and their available columns.',
      sql: 'SELECT * FROM itemhutang ORDER BY kode DESC LIMIT 50'
    },
    {
      name: 'SUPPLIER_OUTSTANDING_PURCHASE_SAMPLE',
      purpose: 'Inspect supplier invoice balances in FIFO order using the existing read contract.',
      sql: "SELECT kode, tanggal, supplier, jumlah, hutang, lunas, jenis, hutang_ke FROM pembelian WHERE hutang_ke = 'supplier' AND hutang > 0 ORDER BY tanggal ASC, kode ASC LIMIT 100"
    }
  ];

  var results = [];
  for (var i = 0; i < queries.length; i++) {
    var q = queries[i];
    var result = {
      name: q.name,
      purpose: q.purpose,
      sql: q.sql,
      success: false,
      row_count: 0,
      columns: [],
      rows: [],
      error: ''
    };

    try {
      var response = sidRetailQuery(q.sql);
      result.api_status = response && response.status ? response.status : '';
      var rows = [];

      if (Array.isArray(response)) {
        rows = response;
      } else if (response && Array.isArray(response.rows)) {
        rows = response.rows;
      } else if (response && Array.isArray(response.data)) {
        rows = response.data;
      }

      result.success = !!(
        response &&
        (
          response.status === 'success' ||
          Array.isArray(response) ||
          Array.isArray(response.rows) ||
          (response.data && Array.isArray(response.data))
        )
      );
      result.rows = rows;
      result.row_count = rows.length;

      if (rows.length && typeof rows[0] === 'object') {
        result.columns = Object.keys(rows[0]);
      }

      if (!result.success && response) {
        result.error = response.message || response.error ||
          'Response shape/status requires manual inspection.';
      }
    } catch (error) {
      result.error = String(error && error.message ? error.message : error);
    }

    Logger.log('\\n--- QUERY: ' + q.name + ' ---');
    Logger.log('PURPOSE: ' + q.purpose);
    Logger.log('SQL: ' + q.sql);
    Logger.log('RESULT: ' + JSON.stringify(result));
    results.push(result);
  }

  var output = {
    diagnostic: 'supplier_payment_queries_v6',
    mode: 'READ_ONLY',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    queries: results
  };

  Logger.log('\\nSUPPLIER PAYMENT GLOBAL DIAGNOSTIC V6 FINAL RESULT: ' +
    JSON.stringify(output));
  return output;
}
