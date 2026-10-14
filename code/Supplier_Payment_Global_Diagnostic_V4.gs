/**
 * SID RETAIL — SUPPLIER PAYMENT GLOBAL DIAGNOSTIC V4
 * ============================================================
 * READ-ONLY. SELECT statements only. No data mutation.
 *
 * Run only on GAS Development:
 *   diagnosticSupplierPaymentQueriesV4()
 *
 * Requires existing sidRetailQuery(sql).
 * ============================================================
 */
function diagnosticSupplierPaymentQueriesV4() {
  var queries = [
    {
      name: 'EXACT_CAKRA_INVOICE',
      purpose: 'Inspect the exact purchase row referenced by the known payment allocation.',
      sql: "SELECT * FROM pembelian WHERE kode = 'R21-270826003' LIMIT 5"
    },
    {
      name: 'RECENT_CAKRA_PURCHASES',
      purpose: 'Inspect newest CAKRA purchases because the V3 ascending sample stopped in early 2024.',
      sql: "SELECT kode, tanggal, supplier, jumlah, hutang, lunas, jenis, hutang_ke FROM pembelian WHERE supplier = 'CAKRA' ORDER BY tanggal DESC LIMIT 15"
    },
    {
      name: 'RETURN_PURCHASE_SAMPLE',
      purpose: 'Confirm actual return_pembelian columns and example data before designing return-aware balance logic.',
      sql: "SELECT * FROM return_pembelian LIMIT 10"
    },
    {
      name: 'DEBT_RETURN_OFFSET_SAMPLE',
      purpose: 'Confirm actual potong_hutang_return columns and example data; an empty result must not be treated as unused table.',
      sql: "SELECT * FROM potong_hutang_return LIMIT 10"
    },
    {
      name: 'ALLOCATIONS_FOR_CA KRA_INVOICE',
      purpose: 'Read all allocation history for the known invoice without JOINs; inspect whether multiple payments reference it.',
      sql: "SELECT kode, kode_hutang, tgl_hutang, jumlah_hutang, `return`, jumlah FROM itemhutang WHERE kode_hutang = 'R21-270826003' LIMIT 50"
    }
  ];
  queries[0].name = 'EXACT_CAKRA_INVOICE';
  queries[1].name = 'RECENT_CAKRA_PURCHASES';
  queries[4].name = 'ALLOCATIONS_FOR_CAKRA_INVOICE';

  var result = {
    diagnostic: 'supplier_payment_queries_v4',
    mode: 'READ_ONLY',
    started_at: new Date().toISOString(),
    queries: []
  };

  Logger.log('====================================================');
  Logger.log('SUPPLIER PAYMENT GLOBAL DIAGNOSTIC V4');
  Logger.log('MODE: READ-ONLY — NO DATA MUTATION');
  Logger.log('====================================================');

  queries.forEach(function(item) {
    Logger.log('--- QUERY: ' + item.name + ' ---');
    Logger.log('PURPOSE: ' + item.purpose);
    Logger.log('SQL: ' + item.sql);
    try {
      var response = sidRetailQuery(item.sql);
      var rows = response && Array.isArray(response.data) ? response.data : [];
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
