/**
 * TB NUSANTARA — SUPPLIER PURCHASE ITEMS AUDIT V1
 * ============================================================
 * READ-ONLY DIAGNOSTIC ONLY.
 *
 * Purpose:
 *   Investigate whether purchase-note item rows can be retrieved
 *   for a real supplier invoice before changing supplier PDF output.
 *
 * Guardrails:
 *   - SELECT only; no INSERT/UPDATE/DELETE.
 *   - Does not change existing production functions.
 *   - Does not register or assume a public API action.
 *   - Candidate table/columns are probes, not a verified contract.
 *   - Run only in GAS Development after syncing this file from GitHub.
 *
 * Default sample:
 *   supplier = BARU
 *   invoice  = R21-071026001
 *
 * This function intentionally tests a likely table name only as a
 * diagnostic hypothesis. A successful response must be inspected
 * for fields, matching invoice key, item names, quantity, unit,
 * price and subtotal before any implementation is approved.
 */

function auditSupplierPurchaseItemsV1(kodeSupplier, kodeNota) {
  var supplier = String(kodeSupplier || 'BARU').trim();
  var nota = String(kodeNota || 'R21-071026001').trim();

  if (!supplier || !/^[a-zA-Z0-9._\\- ]+$/.test(supplier)) {
    throw new Error('Kode supplier tidak valid.');
  }
  if (!nota || !/^[a-zA-Z0-9._\\- ]+$/.test(nota)) {
    throw new Error('Nomor nota tidak valid.');
  }

  var started = Date.now();
  var result = {
    diagnostic: 'supplier_purchase_items_audit_v1',
    mode: 'READ_ONLY',
    supplier: supplier,
    invoice: nota,
    probes: []
  };

  Logger.log('====================================================');
  Logger.log('SUPPLIER PURCHASE ITEMS AUDIT V1');
  Logger.log('MODE: READ-ONLY — DEVELOPMENT ONLY');
  Logger.log('SUPPLIER: ' + supplier);
  Logger.log('INVOICE: ' + nota);
  Logger.log('====================================================');

  // Verify the invoice header independently using the established
  // purchase payable contract. This does not infer item-table schema.
  try {
    var headerSql =
      'SELECT p.kode, p.supplier, p.tanggal, p.jumlah, p.hutang, p.hutang_ke ' +
      'FROM pembelian p WHERE p.supplier = ' + supplierHutangSqlQuoteV1(supplier) +
      ' AND p.kode = ' + supplierHutangSqlQuoteV1(nota) + ' LIMIT 2';
    var headerResponse = sidRetailQuery(headerSql);
    var headerRows = headerResponse && Array.isArray(headerResponse.data)
      ? headerResponse.data : [];

    result.probes.push({
      probe: 'purchase_header',
      success: !!headerResponse && headerResponse.status === 'success',
      row_count: headerRows.length,
      rows: headerRows
    });

    Logger.log('--- PURCHASE HEADER ---');
    Logger.log('QUERY: ' + headerSql);
    Logger.log('ROWS: ' + headerRows.length);
    Logger.log(JSON.stringify(headerRows));
  } catch (error) {
    result.probes.push({
      probe: 'purchase_header',
      success: false,
      error: error && error.message ? error.message : String(error)
    });
    Logger.log('PURCHASE HEADER ERROR: ' +
      (error && error.message ? error.message : String(error)));
  }

  // Hypothesis only: itempembelian may be the purchase line-item table.
  // The query deliberately uses SELECT * LIMIT 20 so returned column
  // names can be inspected without presuming the item schema.
  try {
    var itemSql =
      'SELECT * FROM itempembelian WHERE kode = ' +
      supplierHutangSqlQuoteV1(nota) + ' LIMIT 20';
    var itemResponse = sidRetailQuery(itemSql);
    var itemRows = itemResponse && Array.isArray(itemResponse.data)
      ? itemResponse.data : [];

    result.probes.push({
      probe: 'candidate_itempembelian',
      success: !!itemResponse && itemResponse.status === 'success',
      row_count: itemRows.length,
      columns: itemRows.length ? Object.keys(itemRows[0]) : [],
      rows: itemRows
    });

    Logger.log('--- CANDIDATE ITEMPEMBELIAN ---');
    Logger.log('QUERY: ' + itemSql);
    Logger.log('ROWS: ' + itemRows.length);
    Logger.log('COLUMNS: ' + JSON.stringify(
      itemRows.length ? Object.keys(itemRows[0]) : []
    ));
    Logger.log('SAMPLE ROWS: ' + JSON.stringify(itemRows));
  } catch (error) {
    result.probes.push({
      probe: 'candidate_itempembelian',
      success: false,
      error: error && error.message ? error.message : String(error)
    });
    Logger.log('ITEM TABLE PROBE ERROR: ' +
      (error && error.message ? error.message : String(error)));
  }

  result.duration_ms = Date.now() - started;
  Logger.log('RESULT: ' + JSON.stringify(result));
  Logger.log('DURATION MS: ' + result.duration_ms);
  Logger.log('====================================================');
  return result;
}
