/**
 * SID RETAIL — SUPPLIER PAYMENT GLOBAL DIAGNOSTIC V7
 * MODE: READ-ONLY
 *
 * Tujuan:
 * Mencocokkan sampel kode pembayaran R32 dari hasil V6 dengan header hutang,
 * alokasi itemhutang, dan nota pembelian yang dirujuk.
 *
 * Batasan:
 * - Semua SQL adalah SELECT tetap dengan daftar kode allowlist dan LIMIT.
 * - Tidak ada INSERT, UPDATE, DELETE, atau mutasi data.
 * - Tidak membaca atau menghitung retur; retur ditangani server POS.
 * - Hasil hanya memvalidasi sampel historis, bukan kontrak transaksi lengkap.
 * - Jalankan hanya pada project GAS Development.
 *
 * Cara menjalankan:
 * diagnosticSupplierPaymentQueriesV7()
 *
 * Dependensi:
 * sidRetailQuery(sql) yang sudah tersedia di project GAS.
 */
function diagnosticSupplierPaymentQueriesV7() {
  var paymentCodes = [
    'R32-311225024',
    'R32-311225023',
    'R32-311225022',
    'R32-311225021',
    'R32-310826032'
  ];
  var invoiceCodes = [
    'R21-101025007',
    'R21-070825003',
    'R21-270725007',
    'R21-291025001',
    'R21-120625002',
    'R21-120625001',
    'R21-121125003',
    'R21-100526004',
    'R21-180526006',
    'R21-150526002',
    'R21-080626012'
  ];

  var paymentIn = paymentCodes.map(function(code) {
    return "'" + code + "'";
  }).join(',');
  var invoiceIn = invoiceCodes.map(function(code) {
    return "'" + code + "'";
  }).join(',');

  var queries = [
    {
      name: 'MATCHED_PAYMENT_HEADERS',
      sql: 'SELECT * FROM hutang WHERE kode IN (' + paymentIn + ') LIMIT 20'
    },
    {
      name: 'MATCHED_PAYMENT_ALLOCATIONS',
      sql: 'SELECT kode, kode_hutang, tgl_hutang, jumlah_hutang, jumlah FROM itemhutang WHERE kode IN (' + paymentIn + ') LIMIT 100'
    },
    {
      name: 'MATCHED_PURCHASE_INVOICES',
      sql: 'SELECT kode, tanggal, supplier, jumlah, hutang, lunas, hutang_ke FROM pembelian WHERE kode IN (' + invoiceIn + ') LIMIT 30'
    }
  ];

  var results = [];
  for (var i = 0; i < queries.length; i++) {
    results.push(supplierPaymentDiagnosticRunQueryV7_(queries[i]));
  }

  var headers = supplierPaymentDiagnosticRowsV7_(results[0]);
  var allocations = supplierPaymentDiagnosticRowsV7_(results[1]);
  var headerByCode = Object.create(null);
  var allocationsByCode = Object.create(null);

  headers.forEach(function(row) {
    headerByCode[String(row.kode || '')] = row;
  });

  allocations.forEach(function(row) {
    var code = String(row.kode || '');
    if (!allocationsByCode[code]) {
      allocationsByCode[code] = { count: 0, totalCents: 0 };
    }
    allocationsByCode[code].count += 1;
    allocationsByCode[code].totalCents += supplierPaymentMoneyCentsV7_(row.jumlah);
  });

  var reconciliation = paymentCodes.map(function(code) {
    var header = headerByCode[code] || null;
    var allocation = allocationsByCode[code] || { count: 0, totalCents: 0 };
    var headerCents = header
      ? supplierPaymentMoneyCentsV7_(header.jumlah)
      : null;
    return {
      payment_code: code,
      header_found: !!header,
      header_supplier: header ? String(header.supplier || '') : '',
      header_total: header ? Number(header.jumlah || 0) : null,
      allocation_row_count: allocation.count,
      allocation_total: allocation.totalCents / 100,
      header_equals_allocation_total:
        headerCents === null ? null : headerCents === allocation.totalCents
    };
  });

  var output = {
    diagnostic: 'supplier_payment_queries_v7',
    mode: 'READ_ONLY',
    started_at: new Date().toISOString(),
    sample_payment_codes: paymentCodes,
    sample_invoice_codes: invoiceCodes,
    queries: results,
    payment_reconciliation: reconciliation,
    caveat: 'Sample only; does not prove write path, atomicity, or full accounting semantics.'
  };

  Logger.log('SUPPLIER PAYMENT GLOBAL DIAGNOSTIC V7 FINAL RESULT: ' +
    JSON.stringify(output));
  return output;
}

function supplierPaymentDiagnosticRunQueryV7_(query) {
  var result = {
    name: query.name,
    sql: query.sql,
    success: false,
    row_count: 0,
    columns: [],
    rows: [],
    error: ''
  };

  try {
    var response = sidRetailQuery(query.sql);
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

  Logger.log('QUERY ' + result.name + ': ' + JSON.stringify(result));
  return result;
}

function supplierPaymentDiagnosticRowsV7_(queryResult) {
  return queryResult && Array.isArray(queryResult.rows) ? queryResult.rows : [];
}

function supplierPaymentMoneyCentsV7_(value) {
  var normalized = String(value === null || value === undefined ? '' : value)
    .replace(/,/g, '')
    .trim();
  var amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}
