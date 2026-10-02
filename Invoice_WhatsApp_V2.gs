/**
 * ============================================================
 * TB NUSANTARA - INVOICE WHATSAPP V2
 * ============================================================
 * Unified module for production data, testing and diagnostics.
 * READ-ONLY. No database mutation. API V1 not changed yet.
 *
 * Current audit target: R43-261225003
 */

/**
 * Production data helper.
 * Accounting values remain based on existing source fields until
 * the installment audit is completed.
 */
function getInvoiceWhatsAppData_V2(kodeTransaksi) {
  // Accounting is delegated to the single settlement engine.
  const settlement = getInvoiceSettlementData_V1(kodeTransaksi);

  if (!settlement || settlement.status !== 'success') {
    throw new Error(
      'Gagal mengambil settlement invoice: ' +
      JSON.stringify(settlement)
    );
  }

  const data = settlement.data;

  return {
    status: 'success',
    data: {
      kode_transaksi: data.kode_transaksi,
      tanggal: data.tanggal,
      pelanggan: data.pelanggan,
      nama_pelanggan: data.nama_pelanggan,
      jt: data.jt,
      total_invoice: data.total_invoice,
      sudah_dibayar: data.total_dibayar,
      saldo_hutang: data.saldo_hutang
    }
  };
}

function invoiceWhatsAppNormalizeCode_V2_(kodeTransaksi) {
  const kode = String(kodeTransaksi || '').trim();
  if (!kode) throw new Error('Kode transaksi kosong.');
  if (!/^[a-zA-Z0-9._\- ]+$/.test(kode)) {
    throw new Error('Kode transaksi tidak valid.');
  }
  return kode;
}



/**
 * ============================================================
 * INVOICE SETTLEMENT ENGINE V1
 * ============================================================
 * Development-only accounting helper.
 *
 * Source of truth:
 *   penjualan.jumlah  -> Total Invoice
 *   penjualan.piutang -> Current outstanding balance
 *
 * Derived:
 *   total_dibayar = total_invoice - saldo_hutang
 *
 * itempiutang.jumlah is used only as a server-side validation
 * cross-check. It is NOT used to reconstruct payment history.
 *
 * No database mutation.
 */
function getInvoiceSettlementData_V1(kodeTransaksi) {
  const kode = invoiceWhatsAppNormalizeCode_V2_(kodeTransaksi);
  const safeKode = kode.replace(/'/g, "''");

  const query =
    'SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,jumlah,bayar,angsuran,piutang ' +
    'FROM penjualan ' +
    "WHERE kode = '" + safeKode + "' LIMIT 1";

  console.log('======================================');
  console.log('INVOICE SETTLEMENT ENGINE V1');
  console.log('READ-ONLY');
  console.log('KODE: ' + kode);
  console.log('======================================');
  console.log('HEADER QUERY: ' + query);

  const headerResult = sidRetailQuery(query);
  if (!headerResult || headerResult.status !== 'success') {
    throw new Error(
      'Gagal mengambil invoice untuk settlement: ' +
      JSON.stringify(headerResult)
    );
  }

  const headerRows = Array.isArray(headerResult.data)
    ? headerResult.data
    : [];

  if (!headerRows.length) {
    throw new Error('Invoice tidak ditemukan: ' + kode);
  }

  const row = headerRows[0];

  const totalInvoice = parseMoney(row.jumlah);
  const saldoHutang = Math.max(0, parseMoney(row.piutang));
  const totalDibayar = Math.max(0, totalInvoice - saldoHutang);

  // Read-only server-side validation.
  let itemPiutangJumlah = null;
  let validationDifference = null;
  let validationStatus = 'NOT_CHECKED';

  const itemQuery =
    'SELECT kode,kode_piutang,jumlah_piutang,`return`,jumlah ' +
    'FROM itempiutang ' +
    "WHERE kode_piutang = '" + safeKode + "' LIMIT 1";

  console.log('VALIDATION QUERY: ' + itemQuery);

  const itemResult = sidRetailQuery(itemQuery);

  if (itemResult && itemResult.status === 'success') {
    const itemRows = Array.isArray(itemResult.data)
      ? itemResult.data
      : [];

    if (itemRows.length) {
      itemPiutangJumlah = parseMoney(itemRows[0].jumlah);
      validationDifference = totalDibayar - itemPiutangJumlah;
      validationStatus =
        Math.abs(validationDifference) < 0.01
          ? 'MATCH'
          : 'MISMATCH';
    } else {
      validationStatus = 'NO_ITEMPIUTANG_ROW';
    }
  } else {
    validationStatus = 'VALIDATION_QUERY_FAILED';
  }

  const data = {
    kode_transaksi: row.kode || kode,
    tanggal: row.tanggal || '',
    pelanggan: row.pelanggan || '',
    nama_pelanggan: row.nama_pelanggan || '',
    jt: row.jt || '',

    total_invoice: totalInvoice,
    total_dibayar: totalDibayar,
    saldo_hutang: saldoHutang,

    source: {
      total_invoice: 'penjualan.jumlah',
      saldo_hutang: 'penjualan.piutang',
      total_dibayar: 'penjualan.jumlah - penjualan.piutang'
    },

    validation: {
      itempiutang_jumlah: itemPiutangJumlah,
      difference: validationDifference,
      status: validationStatus
    }
  };

  console.log('SETTLEMENT RESULT: ' + JSON.stringify(data, null, 2));
  console.log('======================================');

  return {
    status: 'success',
    data: data
  };
}

/**
 * Test the settlement engine against the known invoice where
 * the server shows Rp1,512,000 applied and Rp421,000 outstanding.
 */
function testInvoiceSettlement_V1(kodeTransaksi) {
  kodeTransaksi = kodeTransaksi || 'R43-261225003';

  console.log('======================================');
  console.log('TEST INVOICE SETTLEMENT V1');
  console.log('READ-ONLY');
  console.log('KODE: ' + kodeTransaksi);
  console.log('======================================');

  const result = getInvoiceSettlementData_V1(kodeTransaksi);

  console.log('FINAL RESULT:');
  console.log(JSON.stringify(result, null, 2));

  return result;
}

/**
 * GAS editor runner for the second partial-invoice validation.
 * Keeps the settlement engine generic while allowing one-click execution.
 */
function testInvoiceSettlementPartial_V1() {
  return testInvoiceSettlement_V1('R43-130926006');
}


/**
 * ============================================================
 * MULTI-INVOICE SETTLEMENT VALIDATION V1
 * ============================================================
 * Read-only Development test.
 *
 * Samples real invoices from penjualan and validates the same
 * settlement formula across multiple states:
 *   - unpaid / no payment
 *   - partially paid / still outstanding
 *   - fully paid / saldo zero
 *
 * itempiutang is checked by the Settlement Engine when available.
 * No database mutation.
 */
function testInvoiceSettlementMulti_V1() {
  // Keep candidate discovery intentionally small because SID Retail
  // can timeout on broader ORDER BY/LIMIT queries.
  const query =
    'SELECT kode,tanggal,jumlah,piutang ' +
    'FROM penjualan ' +
    'WHERE jumlah > 0 ' +
    'AND piutang >= 0 ' +
    'ORDER BY tanggal DESC ' +
    'LIMIT 20';

  console.log('======================================');
  console.log('MULTI-INVOICE SETTLEMENT VALIDATION V2');
  console.log('READ-ONLY / LIGHTWEIGHT CANDIDATE SCAN');
  console.log('======================================');
  console.log('CANDIDATE QUERY: ' + query);

  const result = sidRetailQuery(query);
  if (!result || result.status !== 'success') {
    throw new Error(
      'Gagal mengambil kandidat invoice: ' + JSON.stringify(result)
    );
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  if (!rows.length) {
    throw new Error('Tidak ada kandidat invoice untuk validation.');
  }

  const candidates = {
    unpaid: null,
    partial: null,
    paid: null
  };

  rows.some(function(row) {
    if (!row || !row.kode) return false;

    const totalInvoice = parseMoney(row.jumlah);
    const saldoHutang = parseMoney(row.piutang);

    if (totalInvoice <= 0 || saldoHutang < 0) return false;

    if (saldoHutang === totalInvoice && !candidates.unpaid) {
      candidates.unpaid = row;
    } else if (
      saldoHutang > 0 &&
      saldoHutang < totalInvoice &&
      !candidates.partial
    ) {
      candidates.partial = row;
    } else if (saldoHutang === 0 && !candidates.paid) {
      candidates.paid = row;
    }

    return !!(
      candidates.unpaid &&
      candidates.partial &&
      candidates.paid
    );
  });

  const selected = [];
  ['unpaid', 'partial', 'paid'].forEach(function(type) {
    if (candidates[type]) {
      selected.push({
        type: type,
        kode: candidates[type].kode,
        tanggal: candidates[type].tanggal || ''
      });
    }
  });

  console.log('CANDIDATE COUNT: ' + rows.length);
  console.log('SELECTED INVOICES: ' + JSON.stringify(selected, null, 2));

  if (!selected.length) {
    throw new Error(
      'Tidak ditemukan invoice yang memenuhi kategori validation.'
    );
  }

  const results = [];
  let allFormulaPass = true;
  let allItemValidationPass = true;

  selected.forEach(function(item) {
    console.log('--------------------------------------');
    console.log('VALIDATING TYPE: ' + item.type);
    console.log('KODE: ' + item.kode);

    try {
      const settlement = getInvoiceSettlementData_V1(item.kode);

      if (!settlement || settlement.status !== 'success') {
        throw new Error(JSON.stringify(settlement));
      }

      const data = settlement.data;
      const expectedPaid =
        Math.max(0, data.total_invoice - data.saldo_hutang);

      const formulaDifference =
        data.total_dibayar - expectedPaid;

      const formulaPass =
        Math.abs(formulaDifference) < 0.01;

      const itemValidationPass =
        data.validation.status === 'MATCH' ||
        data.validation.status === 'NO_ITEMPIUTANG_ROW';

      if (!formulaPass) allFormulaPass = false;
      if (!itemValidationPass) allItemValidationPass = false;

      results.push({
        type: item.type,
        kode: data.kode_transaksi,
        tanggal: data.tanggal,
        nama_pelanggan: data.nama_pelanggan,
        total_invoice: data.total_invoice,
        total_dibayar: data.total_dibayar,
        saldo_hutang: data.saldo_hutang,
        formula_difference: formulaDifference,
        formula_status: formulaPass ? 'PASS' : 'FAIL',
        itempiutang_validation: data.validation.status,
        itempiutang_difference: data.validation.difference
      });

      console.log(
        'RESULT: ' +
        JSON.stringify(results[results.length - 1], null, 2)
      );
    } catch (error) {
      allFormulaPass = false;
      allItemValidationPass = false;

      results.push({
        type: item.type,
        kode: item.kode,
        status: 'ERROR',
        error: error && error.message
          ? error.message
          : String(error)
      });

      console.log(
        'VALIDATION ERROR: ' +
        JSON.stringify(results[results.length - 1], null, 2)
      );
    }
  });

  const summary = {
    candidate_count: rows.length,
    selected_count: selected.length,
    selected_types: selected.map(function(item) {
      return item.type;
    }),
    formula_status: allFormulaPass ? 'PASS' : 'FAIL',
    itempiutang_validation_status:
      allItemValidationPass ? 'PASS' : 'CHECK_REQUIRED',
    results: results
  };

  console.log('======================================');
  console.log('MULTI-INVOICE VALIDATION V2 SUMMARY');
  console.log(JSON.stringify(summary, null, 2));
  console.log('======================================');

  return {
    status: 'success',
    data: summary
  };
}


/**
 * ============================================================
 * PDF INVOICE ACCOUNTING AUDIT V1
 * ============================================================
 * Read-only wrapper around the existing PDF Invoice generator.
 *
 * Purpose:
 * - capture generator errors in the Execution log
 * - inspect the generated PDF response
 * - compare PDF accounting fields with Settlement Engine V1
 * - verify TOTAL INVOICE / SUDAH DIBAYAR / SALDO HUTANG
 *
 * This function does NOT modify the PDF generator.
 */
function testPdfInvoiceAccountingAudit_V1(kodeTransaksi) {
  const kode = invoiceWhatsAppNormalizeCode_V2_(kodeTransaksi);

  console.log('======================================');
  console.log('PDF INVOICE ACCOUNTING AUDIT V1');
  console.log('READ-ONLY');
  console.log('KODE: ' + kode);
  console.log('======================================');

  let pdfResult = null;

  try {
    console.log('CALLING: getPdfInvoiceTransaksi(' + kode + ')');
    pdfResult = getPdfInvoiceTransaksi(kode);

    console.log('PDF GENERATOR RESULT TYPE: ' + typeof pdfResult);
    console.log(
      'PDF GENERATOR RESULT: ' +
      JSON.stringify(pdfResult, null, 2)
    );
  } catch (error) {
    console.log('PDF GENERATOR ERROR');
    console.log('ERROR MESSAGE: ' +
      (error && error.message ? error.message : String(error)));
    console.log('ERROR STACK: ' +
      (error && error.stack ? error.stack : 'NO_STACK'));

    return {
      status: 'error',
      kode_transaksi: kode,
      stage: 'pdf_generator',
      error_message:
        error && error.message ? error.message : String(error),
      error_stack:
        error && error.stack ? error.stack : ''
    };
  }

  let settlement = null;

  try {
    settlement = getInvoiceSettlementData_V1(kode);
  } catch (error) {
    console.log('SETTLEMENT AUDIT ERROR');
    console.log('ERROR MESSAGE: ' +
      (error && error.message ? error.message : String(error)));

    return {
      status: 'error',
      kode_transaksi: kode,
      stage: 'settlement_engine',
      pdf_result: pdfResult,
      error_message:
        error && error.message ? error.message : String(error)
    };
  }

  const pdfAccounting = {
    total_invoice:
      pdfResult && pdfResult.total_invoice !== undefined
        ? parseMoney(pdfResult.total_invoice)
        : null,
    sudah_dibayar:
      pdfResult && pdfResult.sudah_dibayar !== undefined
        ? parseMoney(pdfResult.sudah_dibayar)
        : null,
    saldo_hutang:
      pdfResult && pdfResult.saldo_hutang !== undefined
        ? parseMoney(pdfResult.saldo_hutang)
        : null
  };

  const settlementAccounting = settlement.data;

  const comparison = {
    total_invoice_difference:
      pdfAccounting.total_invoice === null
        ? null
        : pdfAccounting.total_invoice -
          settlementAccounting.total_invoice,

    sudah_dibayar_difference:
      pdfAccounting.sudah_dibayar === null
        ? null
        : pdfAccounting.sudah_dibayar -
          settlementAccounting.total_dibayar,

    saldo_hutang_difference:
      pdfAccounting.saldo_hutang === null
        ? null
        : pdfAccounting.saldo_hutang -
          settlementAccounting.saldo_hutang,

    pdf_has_total_invoice:
      pdfAccounting.total_invoice !== null,

    pdf_has_sudah_dibayar:
      pdfAccounting.sudah_dibayar !== null,

    pdf_has_saldo_hutang:
      pdfAccounting.saldo_hutang !== null
  };

  console.log('PDF ACCOUNTING: ' +
    JSON.stringify(pdfAccounting, null, 2));

  console.log('SETTLEMENT ACCOUNTING: ' +
    JSON.stringify({
      total_invoice: settlementAccounting.total_invoice,
      total_dibayar: settlementAccounting.total_dibayar,
      saldo_hutang: settlementAccounting.saldo_hutang
    }, null, 2));

  console.log('ACCOUNTING COMPARISON: ' +
    JSON.stringify(comparison, null, 2));

  console.log('======================================');

  return {
    status: 'success',
    kode_transaksi: kode,
    pdf_result: pdfResult,
    settlement: settlement,
    comparison: comparison
  };
}


function testPdfInvoiceAccountingAuditPartial_V1() {
  return testPdfInvoiceAccountingAudit_V1('R43-130926006');
}
