/**
 * SID RETAIL — SUPPLIER PAYMENT GLOBAL DIAGNOSTIC V2
 * ============================================================
 * READ-ONLY. No INSERT, UPDATE, DELETE, or schema changes.
 *
 * Purpose:
 *   Follow up Diagnostic V1 using narrowly scoped SELECT queries
 *   to identify payment transaction types, their allocation rows,
 *   and purchase invoices with outstanding debt.
 *
 * Run only against the Development backend:
 *   diagnosticSupplierPaymentQueriesV2()
 *
 * Requires the existing sidRetailQuery(sql) helper.
 * ============================================================
 */

function diagnosticSupplierPaymentQueriesV2() {
  var queries = [
    {
      name: 'HUTANG_TRANSACTION_TYPES',
      purpose: 'Discover stored transaction types before assuming which value represents supplier payments.',
      sql: "SELECT transaksi, COUNT(*) AS jumlah_record FROM hutang GROUP BY transaksi"
    },
    {
      name: 'RECENT_HUTANG_HEADERS',
      purpose: 'Inspect recent header records and their transaction type.',
      sql: "SELECT kode, tanggal, supplier, jumlah, kode_kas, ket, operator, transaksi FROM hutang ORDER BY tanggal DESC LIMIT 10"
    },
    {
      name: 'HUTANG_WITH_ALLOCATION',
      purpose: 'Verify relationship between payment header and invoice allocation using matching kode.',
      sql: "SELECT h.kode AS kode_transaksi, h.tanggal AS tanggal_transaksi, h.supplier, h.jumlah AS jumlah_transaksi, h.transaksi, i.kode_hutang AS kode_nota, i.tgl_hutang, i.jumlah_hutang, i.return AS jumlah_return, i.jumlah AS jumlah_alokasi FROM hutang h LEFT JOIN itemhutang i ON i.kode = h.kode ORDER BY h.tanggal DESC LIMIT 20"
    },
    {
      name: 'PURCHASE_OUTSTANDING_OLDEST',
      purpose: 'Inspect older purchase invoices whose hutang field is positive; verify date format and supplier matching.',
      sql: "SELECT kode, tanggal, supplier, jumlah, hutang, lunas, jenis, hutang_ke FROM pembelian WHERE CAST(hutang AS DECIMAL(18,2)) > 0 ORDER BY tanggal ASC LIMIT 20"
    },
    {
      name: 'SUPPLIER_OUTSTANDING_SAMPLE',
      purpose: 'Check suppliers and their identifiers against purchase outstanding rows.',
      sql: "SELECT p.supplier AS kode_supplier_pembelian, s.kode AS kode_supplier_master, s.nama AS nama_supplier, COUNT(*) AS jumlah_nota, SUM(CAST(p.hutang AS DECIMAL(18,2))) AS total_hutang_tercatat FROM pembelian p LEFT JOIN supplier s ON s.kode = p.supplier WHERE CAST(p.hutang AS DECIMAL(18,2)) > 0 GROUP BY p.supplier, s.kode, s.nama ORDER BY total_hutang_tercatat DESC LIMIT 20"
    }
  ];

  var result = {
    diagnostic: 'supplier_payment_queries_v2',
    mode: 'READ_ONLY',
    started_at: new Date().toISOString(),
    queries: []
  };

  Logger.log('====================================================');
  Logger.log('SUPPLIER PAYMENT GLOBAL DIAGNOSTIC V2');
  Logger.log('MODE: READ-ONLY — NO DATA MUTATION');
  Logger.log('====================================================');

  queries.forEach(function(item) {
    Logger.log('--- QUERY: ' + item.name + ' ---');
    Logger.log('PURPOSE: ' + item.purpose);
    Logger.log('SQL: ' + item.sql);

    try {
      var response = sidRetailQuery(item.sql);
      var rows = response && Array.isArray(response.data)
        ? response.data
        : [];

      var entry = {
        name: item.name,
        purpose: item.purpose,
        api_status: response ? response.status : 'NO_RESPONSE',
        success: !!response && response.status === 'success',
        row_count: rows.length,
        columns: rows.length ? Object.keys(rows[0]) : [],
        rows: rows
      };
      result.queries.push(entry);

      Logger.log('API STATUS: ' + entry.api_status);
      Logger.log('ROW COUNT: ' + entry.row_count);
      Logger.log('COLUMNS: ' + JSON.stringify(entry.columns));
      Logger.log('ROWS: ' + JSON.stringify(rows));
    } catch (error) {
      var message = error && error.message ? error.message : String(error);
      result.queries.push({
        name: item.name,
        purpose: item.purpose,
        success: false,
        error: message
      });
      Logger.log('ERROR: ' + message);
    }
  });

  result.duration_ms = Date.now() - new Date(result.started_at).getTime();
  Logger.log('FINAL RESULT: ' + JSON.stringify(result));
  Logger.log('DURATION MS: ' + result.duration_ms);
  return result;
}
