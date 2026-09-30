/**
 * ============================================================
 * TB NUSANTARA - INVOICE WHATSAPP V1
 * ============================================================
 * READ-ONLY diagnostic module.
 *
 * Tujuan:
 * Mengambil data satu invoice untuk kebutuhan pesan WhatsApp:
 * - Total Invoice  : penjualan.jumlah
 * - Sudah Dibayar  : penjualan.jumlah - penjualan.piutang
 * - Saldo Hutang   : penjualan.piutang
 *
 * Modul ini TIDAK mengubah data dan belum mengubah router/API V1.
 */

/**
 * Ambil data satu invoice secara read-only.
 */
function getInvoiceWhatsAppData_V1(kodeTransaksi) {
  const kode = String(kodeTransaksi || '').trim();

  if (!kode) {
    throw new Error('Kode transaksi kosong.');
  }

  if (!/^[a-zA-Z0-9._\- ]+$/.test(kode)) {
    throw new Error('Kode transaksi tidak valid.');
  }

  const escapedKode = kode.replace(/'/g, "''");

  const query =
    'SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,jumlah,bayar,angsuran,piutang ' +
    'FROM penjualan ' +
    "WHERE kode = '" + escapedKode + "' LIMIT 1";

  console.log('INVOICE WHATSAPP V1');
  console.log('KODE: ' + kode);
  console.log('QUERY: ' + query);

  const result = sidRetailQuery(query);

  if (!result || result.status !== 'success') {
    throw new Error(
      'Gagal mengambil data invoice: ' + JSON.stringify(result)
    );
  }

  const rows = Array.isArray(result.data) ? result.data : [];

  if (!rows.length) {
    throw new Error('Invoice tidak ditemukan: ' + kode);
  }

  const row = rows[0];

  const totalInvoice = parseMoney(row.jumlah);
  const saldoHutang = parseMoney(row.piutang);

  // Nilai yang ditampilkan di WhatsApp mengikuti:
  // sudah dibayar = total invoice - saldo hutang.
  // Tidak mengubah nilai database.
  const sudahDibayar = Math.max(0, totalInvoice - saldoHutang);

  const data = {
    kode_transaksi: row.kode || kode,
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

  console.log('HASIL INVOICE WHATSAPP: ' + JSON.stringify(data));

  return {
    status: 'success',
    data: data
  };
}

/**
 * Diagnostic read-only.
 *
 * Contoh invoice:
 * R43-160725009
 */
function testInvoiceWhatsApp_V1() {
  const kodeTransaksi = 'R43-160725009';

  console.log('======================================');
  console.log('TEST INVOICE WHATSAPP V1');
  console.log('READ-ONLY');
  console.log('KODE: ' + kodeTransaksi);
  console.log('======================================');

  const result = getInvoiceWhatsAppData_V1(kodeTransaksi);

  console.log('RESULT: ' + JSON.stringify(result, null, 2));

  return result;
}
