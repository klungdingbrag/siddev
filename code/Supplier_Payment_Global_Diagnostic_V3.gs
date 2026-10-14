/**
 * SID RETAIL — SUPPLIER PAYMENT GLOBAL DIAGNOSTIC V3
 * ============================================================
 * READ-ONLY. No INSERT, UPDATE, DELETE, or schema changes.
 *
 * Purpose:
 *   Replace the timed-out JOIN diagnostic with small, independent
 *   SELECTs so each table/key can be inspected without JOINs.
 *
 * Run only against the Development backend:
 *   diagnosticSupplierPaymentQueriesV3()
 *
 * Requires the existing sidRetailQuery(sql) helper.
 * ============================================================
 */

function diagnosticSupplierPaymentQueriesV3() {
  var queries = [
    {
      name: 'ITEMHUTANG_SAMPLE',
      purpose: 'Read allocation table independently and confirm its real columns and row shape.',
      sql: "SELECT kode, kode_hutang, tgl_hutang, jumlah_hutang, `return`, jumlah FROM itemhutang LIMIT 10"
    },
    {
      name: 'ITEMHUTANG_FOR_CAKRA_PAYMENT',
      purpose: 'Check whether the known CAKRA payment header reference has allocation rows. Replace spaces in this query name only; SQL key is exact.',
      sql: "SELECT kode, kode_hutang, tgl_hutang, jumlah_hutang, `return`, jumlah FROM itemhutang WHERE kode = 'R32-141026025' LIMIT 20"
    },
    {
      name: 'ITEMHUTANG_FOR_SAMPLE_INVOICE',
      purpose: 'Check allocation history for the invoice shown in the legacy screenshot.',
      sql: "SELECT kode, kode_hutang, tgl_hutang, jumlah_hutang, `return`, jumlah FROM itemhutang WHERE kode_hutang = 'R21-270826003' LIMIT 20"
    },
    {
      name: 'CAKRA_PURCHASE_SAMPLE',
      purpose: 'Read CAKRA purchase invoices separately to compare invoice amounts and current outstanding balances.',
      sql: "SELECT kode, tanggal, supplier, jumlah, hutang, lunas, jenis, hutang_ke FROM pembelian WHERE supplier = 'CAKRA' ORDER BY tanggal ASC LIMIT 30"
    },
    {
      name: 'CAKRA_PAYMENT_HEADERS',
      purpose: 'Read CAKRA payment headers without joining the allocation table.',
      sql: "SELECT kode, tanggal, supplier, jumlah, kode_kas, ket, operator, transaksi FROM hutang WHERE supplier = 'CAKRA' ORDER BY tanggal DESC LIMIT 10"
    }
  ];

  var result = {
    diagnostic: 'supplier_payment_queries_v3',
    mode: 'READ_ONLY',
    started_at: new Date().toISOString(),
    queries: []
  };

  Logger.log('====================================================');
  Logger.log('SUPPLIER PAYMENT GLOBAL DIAGNOSTIC V3');
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
