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

  // Avoid regex character-class parsing issues in GAS editors.
  function isSafeIdentifier(value) {
    if (!value) return false;
    var allowed = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._ -';
    for (var i = 0; i < value.length; i++) {
      if (allowed.indexOf(value.charAt(i)) === -1) return false;
    }
    return true;
  }

  if (!isSafeIdentifier(supplier)) {
    throw new Error('Kode supplier tidak valid.');
  }
  if (!isSafeIdentifier(nota)) {
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

/**
 * Find candidate multi-item supplier invoices and inspect one invoice's
 * item rows for reconciliation. READ-ONLY; run only in GAS Development.
 *
 * Defaults to supplier BARU. It first searches for invoices having more
 * than one item row, then inspects the selected candidate's header/items.
 * If SQL aggregation/join is unsupported by the API backend, the error is
 * logged explicitly and no data is modified.
 */
function auditSupplierPurchaseMultiItemV1(kodeSupplier, kodeNota) {
  var supplier = String(kodeSupplier || 'BARU').trim();
  var explicitNota = String(kodeNota || '').trim();
  function safe(value) {
    if (!value) return false;
    var allowed = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._ -';
    for (var i = 0; i < value.length; i++) {
      if (allowed.indexOf(value.charAt(i)) === -1) return false;
    }
    return true;
  }
  if (!safe(supplier) || (explicitNota && !safe(explicitNota))) {
    throw new Error('Kode supplier atau nota tidak valid.');
  }

  Logger.log('====================================================');
  Logger.log('SUPPLIER MULTI-ITEM AUDIT V1 — READ-ONLY');
  Logger.log('SUPPLIER: ' + supplier);
  Logger.log('====================================================');

  var candidates = [];
  if (!explicitNota) {
    var candidateSql =
      'SELECT p.kode, p.supplier, p.tanggal, p.jumlah, p.hutang, ' +
      'COUNT(i.kode) AS jumlah_item, SUM(i.subtotal) AS total_subtotal ' +
      'FROM pembelian p JOIN itempembelian i ON i.kode = p.kode ' +
      'WHERE p.supplier = ' + supplierHutangSqlQuoteV1(supplier) +
      " AND p.hutang_ke = 'supplier' " +
      'GROUP BY p.kode, p.supplier, p.tanggal, p.jumlah, p.hutang ' +
      'HAVING COUNT(i.kode) > 1 LIMIT 10';
    try {
      var candidateResponse = sidRetailQuery(candidateSql);
      candidates = candidateResponse && Array.isArray(candidateResponse.data)
        ? candidateResponse.data : [];
      Logger.log('--- MULTI-ITEM CANDIDATES ---');
      Logger.log('QUERY: ' + candidateSql);
      Logger.log('API STATUS: ' + (candidateResponse ? candidateResponse.status : 'no response'));
      Logger.log('CANDIDATES: ' + JSON.stringify(candidates));
    } catch (error) {
      Logger.log('CANDIDATE QUERY ERROR: ' +
        (error && error.message ? error.message : String(error)));
      Logger.log('Jika query agregasi/join tidak didukung, jalankan fungsi ini dengan kode nota multi-item yang diketahui: auditSupplierPurchaseMultiItemV1("BARU", "KODE_NOTA").');
      return { diagnostic: 'supplier_purchase_multi_item_audit_v1', mode: 'READ_ONLY', supplier: supplier, success: false, stage: 'candidate_search', error: error && error.message ? error.message : String(error) };
    }
    if (!candidates.length) {
      Logger.log('Tidak ditemukan kandidat multi-item untuk supplier ini. Coba supplier lain atau masukkan kode nota yang diketahui memiliki beberapa item.');
      return { diagnostic: 'supplier_purchase_multi_item_audit_v1', mode: 'READ_ONLY', supplier: supplier, success: true, candidate_count: 0, candidates: [] };
    }
  }

  var nota = explicitNota || String(candidates[0].kode || '').trim();
  if (!nota) throw new Error('Tidak ditemukan kode nota untuk diperiksa.');

  var headerSql =
    'SELECT p.kode, p.supplier, p.tanggal, p.jumlah, p.hutang, p.hutang_ke ' +
    'FROM pembelian p WHERE p.supplier = ' + supplierHutangSqlQuoteV1(supplier) +
    ' AND p.kode = ' + supplierHutangSqlQuoteV1(nota) + ' LIMIT 2';
  var itemsSql =
    'SELECT * FROM itempembelian WHERE kode = ' +
    supplierHutangSqlQuoteV1(nota) + ' LIMIT 100';

  var headerRows = [];
  var itemRows = [];
  var headerOk = false;
  var itemsOk = false;
  try {
    var hr = sidRetailQuery(headerSql);
    headerOk = !!hr && hr.status === 'success';
    headerRows = hr && Array.isArray(hr.data) ? hr.data : [];
    Logger.log('--- PURCHASE HEADER ---');
    Logger.log('QUERY: ' + headerSql);
    Logger.log('API STATUS: ' + (hr ? hr.status : 'no response'));
    Logger.log('ROWS: ' + JSON.stringify(headerRows));
  } catch (error) {
    Logger.log('HEADER ERROR: ' + (error && error.message ? error.message : String(error)));
  }
  try {
    var ir = sidRetailQuery(itemsSql);
    itemsOk = !!ir && ir.status === 'success';
    itemRows = ir && Array.isArray(ir.data) ? ir.data : [];
    Logger.log('--- ITEM ROWS ---');
    Logger.log('QUERY: ' + itemsSql);
    Logger.log('API STATUS: ' + (ir ? ir.status : 'no response'));
    Logger.log('ITEM COUNT RETURNED (LIMIT 100): ' + itemRows.length);
    Logger.log('ITEM COLUMNS: ' + JSON.stringify(itemRows.length ? Object.keys(itemRows[0]) : []));
    Logger.log('ITEM DATA: ' + JSON.stringify(itemRows));
  } catch (error) {
    Logger.log('ITEMS ERROR: ' + (error && error.message ? error.message : String(error)));
  }

  var sum = 0;
  var sumKnown = true;
  itemRows.forEach(function(row) {
    var value = row && row.subtotal !== undefined && row.subtotal !== null
      ? String(row.subtotal).replace(/,/g, '') : '';
    if (value === '' || isNaN(Number(value))) sumKnown = false;
    else sum += Number(value);
  });
  var headerTotal = headerRows.length && headerRows[0].jumlah !== undefined
    ? Number(String(headerRows[0].jumlah).replace(/,/g, '')) : NaN;
  var reconciliation = {
    invoice: nota,
    item_count_returned: itemRows.length,
    item_limit: 100,
    item_subtotal_sum: sumKnown ? Number(sum.toFixed(2)) : null,
    header_invoice_total: isNaN(headerTotal) ? null : headerTotal,
    difference_subtotal_minus_header: sumKnown && !isNaN(headerTotal)
      ? Number((sum - headerTotal).toFixed(2)) : null,
    match_within_one_cent: sumKnown && !isNaN(headerTotal)
      ? Math.abs(sum - headerTotal) < 0.01 : false,
    note: 'Bandingkan hanya setelah memastikan query mengembalikan seluruh baris; diskon/biaya tambahan mungkin memengaruhi rekonsiliasi.'
  };
  Logger.log('--- RECONCILIATION ---');
  Logger.log(JSON.stringify(reconciliation));
  Logger.log('====================================================');
  return {
    diagnostic: 'supplier_purchase_multi_item_audit_v1',
    mode: 'READ_ONLY',
    supplier: supplier,
    invoice: nota,
    header_success: headerOk,
    items_success: itemsOk,
    candidate_count: candidates.length,
    candidates: candidates,
    header_rows: headerRows,
    item_rows: itemRows,
    reconciliation: reconciliation
  };
}

