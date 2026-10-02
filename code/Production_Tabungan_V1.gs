/**
 * TB NUSANTARA
 * PRODUCTION TABUNGAN V1
 *
 * Tujuan:
 * Menyediakan saldo tabungan pelanggan dari sumber authoritative:
 *
 *   pelanggan.saldo_tabungan
 *
 * Prinsip:
 * - Tidak menghitung ulang saldo dari tabel tabungan.
 * - Tidak mengubah fungsi piutang yang sudah ada.
 * - Tidak mengubah frontend.
 * - Fungsi baru berdiri sendiri agar mudah diuji dan diintegrasikan.
 *
 * Prasyarat:
 * - sidRetailQuery() dari Code.gs production tersedia.
 */

/**
 * Escape nilai string untuk SQL literal sederhana.
 */
function tabunganV1SqlEscape_(value) {
  return String(value == null ? '' : value).replace(/'/g, "''");
}

/**
 * Mengambil saldo tabungan pelanggan.
 *
 * @param {string} kodePelanggan Kode pelanggan.
 * @return {{
 *   success: boolean,
 *   kode_pelanggan: string,
 *   nama: string,
 *   saldo_tabungan: number
 * }}
 */
function getSaldoTabunganPelanggan(kodePelanggan) {
  var kode = String(kodePelanggan == null ? '' : kodePelanggan).trim();

  if (!kode) {
    throw new Error('Kode pelanggan wajib diisi.');
  }

  var safeKode = tabunganV1SqlEscape_(kode);

  var sql =
    "SELECT kode,nama,saldo_tabungan " +
    "FROM pelanggan " +
    "WHERE kode = '" + safeKode + "' " +
    "LIMIT 1";

  var result = sidRetailQuery(sql);
  var rows = result.data || result.rows || [];

  if (!rows.length) {
    throw new Error('Pelanggan tidak ditemukan: ' + kode);
  }

  var row = rows[0];

  return {
    success: true,
    kode_pelanggan: String(row.kode || kode),
    nama: String(row.nama || '').trim(),
    saldo_tabungan: Number(row.saldo_tabungan || 0)
  };
}

/**
 * Test production V1.
 *
 * Menggunakan pelanggan yang sudah tervalidasi pada diagnostic:
 * 2606030 - FIKA
 *
 * Expected:
 * saldo_tabungan = 97.000.000
 */
function testProductionTabunganV1() {
  var kodePelanggan = '2606030';

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - PRODUCTION TABUNGAN V1');
  Logger.log('READ TEST - BELUM INTEGRASI FRONTEND');
  Logger.log('==============================================');

  var start = new Date().getTime();

  var result = getSaldoTabunganPelanggan(kodePelanggan);

  var expected = 97000000;
  var difference = result.saldo_tabungan - expected;

  var validation = {
    success: result.success === true,
    kode_pelanggan: result.kode_pelanggan === kodePelanggan,
    nama: result.nama === 'FIKA',
    saldo_expected: expected,
    saldo_actual: result.saldo_tabungan,
    difference: difference,
    saldo_match: Math.abs(difference) < 0.005,
    duration_ms: new Date().getTime() - start
  };

  validation.validation =
    validation.success &&
    validation.kode_pelanggan &&
    validation.nama &&
    validation.saldo_match;

  Logger.log('HASIL:');
  Logger.log(JSON.stringify({
    result: result,
    validation: validation
  }, null, 2));

  if (!validation.validation) {
    throw new Error(
      'Validasi Production Tabungan V1 gagal: ' +
      JSON.stringify(validation)
    );
  }

  Logger.log('VALIDATION: PASS');
  return {
    status: 'VALIDATION_PASS',
    result: result,
    validation: validation
  };
}