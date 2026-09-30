/**
 * ============================================================
 * TB NUSANTARA - INVOICE WHATSAPP AUDIT V2
 * ============================================================
 * READ-ONLY diagnostic module.
 *
 * Tujuan:
 * Audit struktur nilai invoice yang memiliki angsuran:
 * R43-261225003
 *
 * Membandingkan:
 * - penjualan.jumlah
 * - penjualan.bayar
 * - penjualan.angsuran
 * - penjualan.piutang
 * - SUM(itempenjualan.subtotal)
 *
 * Modul ini TIDAK mengubah data.
 * Modul ini BELUM menjadi API/production module.
 */

function auditInvoiceWhatsApp_V2(kodeTransaksi) {
  const kode = String(kodeTransaksi || '').trim();

  if (!kode) throw new Error('Kode transaksi kosong.');
  if (!/^[a-zA-Z0-9._\- ]+$/.test(kode)) {
    throw new Error('Kode transaksi tidak valid.');
  }

  const escapedKode = kode.replace(/'/g, "''");

  const headerQuery =
    'SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,jumlah,bayar,angsuran,piutang ' +
    'FROM penjualan ' +
    "WHERE kode = '" + escapedKode + "' LIMIT 1";

  const detailQuery =
    'SELECT kode_transaksi,subtotal ' +
    'FROM itempenjualan ' +
    "WHERE kode_transaksi = '" + escapedKode + "'";

  console.log('======================================');
  console.log('AUDIT INVOICE WHATSAPP V2');
  console.log('READ-ONLY');
  console.log('KODE: ' + kode);
  console.log('======================================');

  console.log('HEADER QUERY: ' + headerQuery);
  const headerResult = sidRetailQuery(headerQuery);

  if (!headerResult || headerResult.status !== 'success') {
    throw new Error('Gagal mengambil header invoice: ' + JSON.stringify(headerResult));
  }

  const headerRows = Array.isArray(headerResult.data) ? headerResult.data : [];
  if (!headerRows.length) {
    throw new Error('Invoice tidak ditemukan: ' + kode);
  }

  const header = headerRows[0];

  console.log('DETAIL QUERY: ' + detailQuery);
  const detailResult = sidRetailQuery(detailQuery);

  if (!detailResult || detailResult.status !== 'success') {
    throw new Error('Gagal mengambil detail invoice: ' + JSON.stringify(detailResult));
  }

  const detailRows = Array.isArray(detailResult.data) ? detailResult.data : [];

  const jumlah = parseMoney(header.jumlah);
  const bayar = parseMoney(header.bayar);
  const angsuran = parseMoney(header.angsuran);
  const piutang = parseMoney(header.piutang);

  let subtotalItem = 0;
  detailRows.forEach(function(row) {
    subtotalItem += parseMoney(row.subtotal);
  });

  const calculatedPaid = Math.max(0, jumlah - piutang);
  const headerVsItem = jumlah - subtotalItem;
  const jumlahVsPiutang = jumlah - piutang;
  const bayarPlusAngsuran = bayar + angsuran;
  const paidVsBayarAngsuran = calculatedPaid - bayarPlusAngsuran;
  const accountingCheck = jumlah - piutang;

  const audit = {
    kode_transaksi: header.kode || kode,
    tanggal: header.tanggal || '',
    pelanggan: header.pelanggan || '',
    nama_pelanggan: header.nama_pelanggan || '',
    jt: header.jt || '',

    penjualan: {
      jumlah: jumlah,
      bayar: bayar,
      angsuran: angsuran,
      piutang: piutang
    },

    itempenjualan: {
      item_count: detailRows.length,
      subtotal: subtotalItem
    },

    rekonsiliasi: {
      jumlah_minus_subtotal_item: headerVsItem,
      jumlah_minus_piutang: jumlahVsPiutang,
      bayar_plus_angsuran: bayarPlusAngsuran,
      calculated_sudah_dibayar: calculatedPaid,
      calculated_paid_minus_bayar_plus_angsuran: paidVsBayarAngsuran,
      accounting_saldo_check: accountingCheck
    },

    raw_header: header,
    raw_items: detailRows
  };

  console.log('--------------------------------------');
  console.log('PENJUALAN');
  console.log('JUMLAH   : ' + jumlah);
  console.log('BAYAR    : ' + bayar);
  console.log('ANGSURAN : ' + angsuran);
  console.log('PIUTANG  : ' + piutang);
  console.log('--------------------------------------');
  console.log('ITEM PENJUALAN');
  console.log('ITEM COUNT : ' + detailRows.length);
  console.log('SUBTOTAL   : ' + subtotalItem);
  console.log('--------------------------------------');
  console.log('REKONSILIASI');
  console.log('JUMLAH - SUBTOTAL ITEM : ' + headerVsItem);
  console.log('JUMLAH - PIUTANG       : ' + jumlahVsPiutang);
  console.log('BAYAR + ANGSURAN       : ' + bayarPlusAngsuran);
  console.log('CALCULATED DIBAYAR     : ' + calculatedPaid);
  console.log('SELISIH DIBAYAR        : ' + paidVsBayarAngsuran);
  console.log('======================================');
  console.log('AUDIT RESULT: ' + JSON.stringify(audit, null, 2));

  return {
    status: 'success',
    audit: audit
  };
}

function testAuditInvoiceAngsuran_V2() {
  return auditInvoiceWhatsApp_V2('R43-261225003');
}
