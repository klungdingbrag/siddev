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
  const kode = invoiceWhatsAppNormalizeCode_V2_(kodeTransaksi);
  const query =
    'SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,jumlah,bayar,angsuran,piutang ' +
    'FROM penjualan ' +
    "WHERE kode = '" + kode.replace(/'/g, "''") + "' LIMIT 1";

  console.log('INVOICE WHATSAPP V2');
  console.log('KODE: ' + kode);
  console.log('QUERY: ' + query);

  const result = sidRetailQuery(query);
  if (!result || result.status !== 'success') {
    throw new Error('Gagal mengambil data invoice: ' + JSON.stringify(result));
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  if (!rows.length) throw new Error('Invoice tidak ditemukan: ' + kode);

  return invoiceWhatsAppBuildData_V2_(rows[0], kode);
}

/**
 * Diagnostic: inspect itempenjualan schema before querying detail.
 * Do not guess the relation column name.
 */
function auditInvoiceWhatsApp_V2(kodeTransaksi) {
  const kode = invoiceWhatsAppNormalizeCode_V2_(kodeTransaksi);

  console.log('======================================');
  console.log('AUDIT INVOICE WHATSAPP V2');
  console.log('READ-ONLY');
  console.log('KODE: ' + kode);
  console.log('======================================');

  const header = invoiceWhatsAppAuditHeader_V2_(kode);
  const itemAudit = invoiceWhatsAppAuditItems_V2_(kode);
  const tableAudit = invoiceWhatsAppAuditPaymentTables_V2_();

  const totalInvoice = parseMoney(header.jumlah);
  const totalItemSubtotal = itemAudit.total_subtotal;
  const saldoHutang = parseMoney(header.piutang);
  const impliedSettlement = totalInvoice - saldoHutang;
  const bayarField = parseMoney(header.bayar);
  const angsuranField = parseMoney(header.angsuran);

  const audit = {
    kode_transaksi: header.kode || kode,
    tanggal: header.tanggal || '',
    pelanggan: header.pelanggan || '',
    nama_pelanggan: header.nama_pelanggan || '',
    jt: header.jt || '',
    penjualan: {
      jumlah: totalInvoice,
      bayar: bayarField,
      angsuran: angsuranField,
      piutang: saldoHutang,
      bayar_plus_angsuran: bayarField + angsuranField,
      implied_settlement_from_piutang: impliedSettlement
    },
    itempenjualan: itemAudit,
    payment_table_candidates: tableAudit,
    reconciliation: {
      invoice_vs_items_difference: totalInvoice - totalItemSubtotal,
      header_settlement_difference: impliedSettlement - (bayarField + angsuranField),
      status:
        totalInvoice === totalItemSubtotal &&
        Math.abs(impliedSettlement - (bayarField + angsuranField)) < 0.01
          ? 'CONSISTENT'
          : 'NEEDS_PAYMENT_HISTORY_AUDIT'
    }
  };

  console.log('--------------------------------------');
  console.log('RECONCILIATION');
  console.log(JSON.stringify(audit.reconciliation, null, 2));
  console.log('--------------------------------------');
  console.log('FULL AUDIT');
  console.log(JSON.stringify(audit, null, 2));
  console.log('======================================');

  return { status: 'success', audit: audit };
}

function invoiceWhatsAppAuditHeader_V2_(kode) {
  const query =
    'SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,jumlah,bayar,angsuran,piutang ' +
    'FROM penjualan ' +
    "WHERE kode = '" + kode.replace(/'/g, "''") + "' LIMIT 1";

  console.log('HEADER QUERY: ' + query);

  const result = sidRetailQuery(query);
  if (!result || result.status !== 'success') {
    throw new Error('Gagal mengambil header invoice: ' + JSON.stringify(result));
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  if (!rows.length) throw new Error('Invoice tidak ditemukan: ' + kode);

  const header = rows[0];
  console.log('HEADER: ' + JSON.stringify(header, null, 2));
  return header;
}

function invoiceWhatsAppAuditItems_V2_(kode) {
  const safeKode = kode.replace(/'/g, "''");
  const query =
    'SELECT kode,kode_barang,nama_barang,satuan,qty,harga,diskon,subtotal ' +
    'FROM itempenjualan ' +
    "WHERE kode = '" + safeKode + "'";

  console.log('--------------------------------------');
  console.log('ITEMPENJUALAN QUERY');
  console.log('QUERY: ' + query);

  const result = sidRetailQuery(query);
  if (!result || result.status !== 'success') {
    throw new Error('Gagal mengambil detail itempenjualan: ' + JSON.stringify(result));
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  const totalSubtotal = rows.reduce(function(sum, row) {
    return sum + parseMoney(row.subtotal);
  }, 0);

  rows.forEach(function(row, index) {
    console.log(
      'ITEM ' + (index + 1) +
      ' | KODE=' + (row.kode_barang || '') +
      ' | NAMA=' + (row.nama_barang || '') +
      ' | QTY=' + (row.qty || '') +
      ' | HARGA=' + parseMoney(row.harga) +
      ' | DISKON=' + parseMoney(row.diskon) +
      ' | SUBTOTAL=' + parseMoney(row.subtotal)
    );
  });

  console.log('ITEM COUNT: ' + rows.length);
  console.log('SUM SUBTOTAL: ' + totalSubtotal);

  return {
    row_count: rows.length,
    total_subtotal: totalSubtotal,
    rows: rows
  };
}

function invoiceWhatsAppAuditPaymentTables_V2_() {
  const showTablesQuery = 'SHOW TABLES';
  console.log('--------------------------------------');
  console.log('TABLE DISCOVERY QUERY');
  console.log('QUERY: ' + showTablesQuery);

  const result = sidRetailQuery(showTablesQuery);
  if (!result || result.status !== 'success') {
    console.log('TABLE DISCOVERY FAILED: ' + JSON.stringify(result));
    return {
      status: 'failed',
      error: JSON.stringify(result)
    };
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  const candidates = [];

  rows.forEach(function(row) {
    const keys = Object.keys(row || {});
    if (!keys.length) return;

    const tableName = String(row[keys[0]] || '').trim();
    if (!tableName) return;

    if (/(bayar|angs|piut|pelun|cicil|kas|terima|tagih|payment|receipt|settle)/i.test(tableName)) {
      candidates.push(tableName);
    }
  });

  console.log('CANDIDATE PAYMENT TABLES: ' + JSON.stringify(candidates));

  const inspected = candidates.map(function(tableName) {
    const safeIdentifier = tableName.replace(/\\/g, '\\\\').replace(/\`/g, '\\`');
    const query = 'SHOW COLUMNS FROM \`' + safeIdentifier + '\`';
    const schemaResult = sidRetailQuery(query);

    if (!schemaResult || schemaResult.status !== 'success') {
      return {
        table: tableName,
        status: 'schema_failed',
        error: JSON.stringify(schemaResult)
      };
    }

    const schemaRows = Array.isArray(schemaResult.data) ? schemaResult.data : [];
    const fields = schemaRows.map(function(column) {
      return {
        field: column.Field || column.field || '',
        type: column.Type || column.type || '',
        key: column.Key || column.key || ''
      };
    });

    const relationFields = fields.filter(function(column) {
      return /^(kode|kode_transaksi|nota|no_nota|nomor_nota|invoice|kode_penjualan|referensi|reference)$/i.test(column.field);
    });

    return {
      table: tableName,
      status: 'success',
      column_count: fields.length,
      relation_fields: relationFields,
      fields: fields
    };
  });

  return {
    status: 'success',
    table_count: rows.length,
    candidate_count: inspected.length,
    candidates: inspected
  };
}


/** Test production helper without changing data. */
function testInvoiceWhatsApp_V2() {
  const kodeTransaksi = 'R43-160725009';
  console.log('======================================');
  console.log('TEST INVOICE WHATSAPP V2');
  console.log('READ-ONLY');
  console.log('KODE: ' + kodeTransaksi);
  console.log('======================================');
  const result = getInvoiceWhatsAppData_V2(kodeTransaksi);
  console.log('RESULT: ' + JSON.stringify(result, null, 2));
  return result;
}

/** Test installment audit target. */
function testAuditInvoiceAngsuran_V2() {
  return auditInvoiceWhatsApp_V2('R43-261225003');
}

function invoiceWhatsAppNormalizeCode_V2_(kodeTransaksi) {
  const kode = String(kodeTransaksi || '').trim();
  if (!kode) throw new Error('Kode transaksi kosong.');
  if (!/^[a-zA-Z0-9._\- ]+$/.test(kode)) {
    throw new Error('Kode transaksi tidak valid.');
  }
  return kode;
}

function invoiceWhatsAppBuildData_V2_(row, fallbackCode) {
  const totalInvoice = parseMoney(row.jumlah);
  const saldoHutang = parseMoney(row.piutang);
  const sudahDibayar = Math.max(0, totalInvoice - saldoHutang);

  const data = {
    kode_transaksi: row.kode || fallbackCode,
    tanggal: row.tanggal || '',
    pelanggan: row.pelanggan || '',
    nama_pelanggan: row.nama_pelanggan || '',
    jt: row.jt || '',
    total_invoice: totalInvoice,
    sudah_dibayar: sudahDibayar,
    saldo_hutang: saldoHutang,
    bayar_field: parseMoney(row.bayar),
    angsuran_field: parseMoney(row.angsuran)
  };

  console.log('HASIL INVOICE WHATSAPP V2: ' + JSON.stringify(data));
  return { status: 'success', data: data };
}
