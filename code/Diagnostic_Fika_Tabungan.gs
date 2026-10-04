/**
 * SID RETAIL - DIAGNOSTIC FIKA TABUNGAN
 *
 * File khusus untuk investigasi pelanggan FIKA:
 * Kode pelanggan: 2606030
 *
 * TUJUAN:
 * 1. Menentukan bagian query tabungan yang menyebabkan HTTP 504.
 * 2. Membandingkan COUNT, SELECT tanpa ORDER BY, dan SELECT dengan ORDER BY.
 * 3. Mencatat waktu eksekusi dan potongan response mentah.
 *
 * CATATAN:
 * - Read-only. Tidak INSERT/UPDATE/DELETE.
 * - Tidak mengubah Customer_API_V1.gs.
 * - Tidak dipakai oleh route produksi.
 * - Jangan menggunakan fungsi berakhiran "_" agar fungsi tetap terlihat
 *   pada menu Run Apps Script.
 */

const FIKA_DIAGNOSTIC_CODE = '2606030';

function testFikaTabunganDiagnostic() {
  Logger.log('==================================================');
  Logger.log('DIAGNOSTIC FIKA TABUNGAN');
  Logger.log('KODE PELANGGAN: ' + FIKA_DIAGNOSTIC_CODE);
  Logger.log('MODE: READ-ONLY');
  Logger.log('==================================================');

  testFikaTabunganCount();
  testFikaTabunganSelectTanpaOrder();
  testFikaTabunganSelectDenganOrder();
  testFikaTabunganSelectSeratusDenganOrder();
  testFikaTabunganOrderVariasi();

  Logger.log('==================================================');
  Logger.log('DIAGNOSTIC FIKA TABUNGAN SELESAI');
  Logger.log('==================================================');
}

function testFikaTabunganCount() {
  runFikaDiagnosticQuery(
    'TEST 1 - COUNT DATA FIKA',
    'SELECT COUNT(*) AS jumlah FROM tabungan WHERE pelanggan = ' +
      customerSqlQuoteFika(FIKA_DIAGNOSTIC_CODE)
  );
}

function testFikaTabunganSelectTanpaOrder() {
  runFikaDiagnosticQuery(
    'TEST 2 - SELECT 10 TANPA ORDER BY',
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,keterangan ' +
      'FROM tabungan WHERE pelanggan = ' +
      customerSqlQuoteFika(FIKA_DIAGNOSTIC_CODE) +
      ' LIMIT 10'
  );
}

function testFikaTabunganSelectDenganOrder() {
  runFikaDiagnosticQuery(
    'TEST 3 - SELECT 10 DENGAN ORDER BY',
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,keterangan ' +
      'FROM tabungan WHERE pelanggan = ' +
      customerSqlQuoteFika(FIKA_DIAGNOSTIC_CODE) +
      ' ORDER BY tanggal ASC,jam ASC,kode ASC LIMIT 10'
  );
}

function testFikaTabunganSelectSeratusDenganOrder() {
  runFikaDiagnosticQuery(
    'TEST 4 - SELECT 100 DENGAN ORDER BY',
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,keterangan ' +
      'FROM tabungan WHERE pelanggan = ' +
      customerSqlQuoteFika(FIKA_DIAGNOSTIC_CODE) +
      ' ORDER BY tanggal ASC,jam ASC,kode ASC LIMIT 100'
  );
}

function testFikaTabunganOrderVariasi() {
  runFikaDiagnosticQuery(
    'TEST 5A - ORDER BY KODE',
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis ' +
      'FROM tabungan WHERE pelanggan = ' +
      customerSqlQuoteFika(FIKA_DIAGNOSTIC_CODE) +
      ' ORDER BY kode ASC LIMIT 100'
  );

  runFikaDiagnosticQuery(
    'TEST 5B - ORDER BY TANGGAL',
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis ' +
      'FROM tabungan WHERE pelanggan = ' +
      customerSqlQuoteFika(FIKA_DIAGNOSTIC_CODE) +
      ' ORDER BY tanggal ASC LIMIT 100'
  );

  runFikaDiagnosticQuery(
    'TEST 5C - ORDER BY TANGGAL,JAM',
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis ' +
      'FROM tabungan WHERE pelanggan = ' +
      customerSqlQuoteFika(FIKA_DIAGNOSTIC_CODE) +
      ' ORDER BY tanggal ASC,jam ASC LIMIT 100'
  );
}

function runFikaDiagnosticQuery(label, query) {
  Logger.log('');
  Logger.log('--------------------------------------------------');
  Logger.log(label);
  Logger.log('QUERY: ' + query);

  var startedAt = Date.now();

  try {
    var apiKey = getApiKey();
    var trxCode = generateTrxCode();

    var url = SID_CONFIG.BASE_URL +
      encodeURIComponent(apiKey) + '/' +
      encodeURIComponent(trxCode) + '/' +
      encodeURIComponent(query);

    var response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true
    });

    var elapsedMs = Date.now() - startedAt;
    var httpCode = response.getResponseCode();
    var responseText = response.getContentText();

    Logger.log('TRX CODE: ' + trxCode);
    Logger.log('HTTP CODE: ' + httpCode);
    Logger.log('DURATION MS: ' + elapsedMs);
    Logger.log('RESPONSE LENGTH: ' + responseText.length);
    Logger.log('RESPONSE PREVIEW: ' + responseText.substring(0, 1000));

    if (httpCode >= 200 && httpCode < 300) {
      try {
        var json = JSON.parse(responseText);
        Logger.log('JSON STATUS: ' + (json.status || '(tidak tersedia)'));
        Logger.log(
          'JSON DATA COUNT: ' +
          (Array.isArray(json.data) ? json.data.length : '(bukan array)')
        );
        Logger.log('RESULT: PASS');
      } catch (parseError) {
        Logger.log('JSON PARSE: FAIL');
        Logger.log('PARSE ERROR: ' + parseError.message);
        Logger.log('RESULT: FAIL - HTTP 2xx tetapi response bukan JSON');
      }
    } else {
      Logger.log('RESULT: FAIL - HTTP ' + httpCode);
    }
  } catch (error) {
    Logger.log('DIAGNOSTIC EXCEPTION: ' +
      (error && error.message ? error.message : String(error)));
    Logger.log('RESULT: FAIL - EXCEPTION');
  }

  Logger.log('--------------------------------------------------');
}

function customerSqlQuoteFika(value) {
  return "'" + String(value || '').replace(/'/g, "''") + "'";
}
