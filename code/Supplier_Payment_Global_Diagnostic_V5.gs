/**
 * SID Retail — Supplier Payment Global Diagnostic V5
 * READ-ONLY diagnostic only. No INSERT/UPDATE/DELETE and no deployment.
 *
 * Goal:
 * Inspect CAKRA return records and payment allocation rows to determine
 * whether returns affect supplier debt settlement and which fields link them.
 *
 * Depends on existing sidRetailQuery(sql).
 */
function diagnosticSupplierPaymentQueriesV5() {
  var startedAt = new Date().toISOString();
  var queries = [
    {
      name: "CAKRA_RETURNS_RECENT",
      purpose: "Inspect recent return records for CAKRA, including invoice references and return flags.",
      sql: "SELECT * FROM return_pembelian WHERE supplier = 'CAKRA' ORDER BY tanggal DESC LIMIT 30"
    },
    {
      name: "CAKRA_RETURNS_USED_IN_DEBT",
      purpose: "Check CAKRA return rows marked as used in a debt transaction.",
      sql: "SELECT * FROM return_pembelian WHERE supplier = 'CAKRA' AND sdh_pake_di_trx_hutang = 'True' LIMIT 30"
    },
    {
      name: "CAKRA_RETURNS_WITH_DEBT_REFERENCE",
      purpose: "Inspect CAKRA return rows with a populated debt-payment reference.",
      sql: "SELECT * FROM return_pembelian WHERE supplier = 'CAKRA' AND no_hutang_dibayar <> '' LIMIT 30"
    },
    {
      name: "RECENT_CAKRA_ITEMHUTANG",
      purpose: "Inspect recent payment allocation details without JOINs; compare payment codes with known headers.",
      sql: "SELECT * FROM itemhutang WHERE kode LIKE 'R32-%' ORDER BY kode DESC LIMIT 30"
    },
    {
      name: "CAKRA_UNPAID_PURCHASES",
      purpose: "Retrieve recent CAKRA supplier invoices that currently show outstanding balances.",
      sql: "SELECT kode, tanggal, supplier, jumlah, hutang, lunas, jenis, hutang_ke FROM pembelian WHERE supplier = 'CAKRA' AND hutang <> '.00' ORDER BY tanggal ASC LIMIT 50"
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
      error: ""
    };
    try {
      var response = sidRetailQuery(q.sql);
      result.api_status = response && response.status ? response.status : "";
      var rows = [];
      if (Array.isArray(response)) {
        rows = response;
      } else if (response && Array.isArray(response.rows)) {
        rows = response.rows;
      } else if (response && response.data && Array.isArray(response.data)) {
        rows = response.data;
      }
      result.success = !!(response && (response.status === "success" || Array.isArray(response) || Array.isArray(response.rows) || (response.data && Array.isArray(response.data))));
      result.rows = rows;
      result.row_count = rows.length;
      if (rows.length && typeof rows[0] === "object") {
        result.columns = Object.keys(rows[0]);
      }
      if (!result.success && response) {
        result.error = response.message || response.error || "Response shape/status requires manual inspection.";
      }
    } catch (e) {
      result.error = String(e && e.message ? e.message : e);
    }
    Logger.log("\n--- QUERY: " + q.name + " ---");
    Logger.log("PURPOSE: " + q.purpose);
    Logger.log("SQL: " + q.sql);
    Logger.log("RESULT: " + JSON.stringify(result));
    results.push(result);
  }

  var output = {
    diagnostic: "supplier_payment_queries_v5",
    mode: "READ_ONLY",
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    queries: results
  };
  Logger.log("\nSUPPLIER PAYMENT GLOBAL DIAGNOSTIC V5 FINAL RESULT: " + JSON.stringify(output));
  return output;
}
