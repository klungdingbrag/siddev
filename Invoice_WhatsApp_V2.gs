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
function testInvoiceSettlement_V1() {
  const kodeTransaksi = 'R43-261225003';

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
