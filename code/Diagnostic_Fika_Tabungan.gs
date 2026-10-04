/**
 * SID RETAIL - DIAGNOSTIC FIKA TABUNGAN
 *
 * File khusus untuk investigasi pelanggan FIKA:
 * Kode pelanggan: 2606030
 *
 * TUJUAN:
 * 1. Menentukan bagian query tabungan yang menyebabkan HTTP 504.
 * 2. Membandingkan COUNT, SELECT tanpa ORDER BY, dan SELECT dengan ORDER BY.
 * 3. Menjalankan exact production query 5x berturut-turut untuk mendeteksi
 *    kegagalan transient/intermittent.
 * 4. Mencatat waktu eksekusi dan response mentah.
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
  testFikaTabunganExactProductionLimaKali();

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

function testFikaTabunganExactProductionLimaKali() {
  var query =
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,keterangan,kode_kas,sumber,sumber_faktur ' +
    'FROM tabungan WHERE pelanggan = ' +
    customerSqlQuoteFika(FIKA_DIAGNOSTIC_CODE) +
    ' ORDER BY tanggal ASC,jam ASC,kode ASC LIMIT 100';

  Logger.log('');
  Logger.log('==================================================');
  Logger.log('TEST 6 - EXACT PRODUCTION QUERY 5X');
  Logger.log('QUERY: ' + query);
  Logger.log('==================================================');

  var successCount = 0;
  var failureCount = 0;
  var httpCodes = [];
  var durations = [];

  for (var attempt = 1; attempt <= 5; attempt++) {
    Logger.log('');
    Logger.log('EXACT PRODUCTION ATTEMPT ' + attempt + '/5');

    var result = runFikaDiagnosticQuery(
      'EXACT PRODUCTION ATTEMPT ' + attempt + '/5',
      query
    );

    httpCodes.push(result.httpCode);
    durations.push(result.elapsedMs);

    if (result.httpCode >= 200 && result.httpCode < 300) {
      successCount++;
    } else {
      failureCount++;
    }
  }

  Logger.log('');
  Logger.log('EXACT PRODUCTION SUMMARY');
  Logger.log('SUCCESS COUNT: ' + successCount);
  Logger.log('FAILURE COUNT: ' + failureCount);
  Logger.log('HTTP CODES: ' + JSON.stringify(httpCodes));
  Logger.log('DURATIONS MS: ' + JSON.stringify(durations));

  if (failureCount === 0) {
    Logger.log('EXACT PRODUCTION QUERY 5X: ALL PASS');
  } else {
    Logger.log('EXACT PRODUCTION QUERY 5X: INTERMITTENT/FAILURE DETECTED');
  }

  Logger.log('==================================================');
}

function runFikaDiagnosticQuery(label, query) {
  Logger.log('');
  Logger.log('--------------------------------------------------');
  Logger.log(label);
  Logger.log('QUERY: ' + query);

  var startedAt = Date.now();
  var httpCode = 0;
  var responseText = '';

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
    httpCode = response.getResponseCode();
    responseText = response.getContentText();

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

    Logger.log('--------------------------------------------------');

    return {
      httpCode: httpCode,
      elapsedMs: elapsedMs,
      responseLength: responseText.length
    };
  } catch (error) {
    var elapsedOnError = Date.now() - startedAt;

    Logger.log('DIAGNOSTIC EXCEPTION: ' +
      (error && error.message ? error.message : String(error)));
    Logger.log('RESULT: FAIL - EXCEPTION');
    Logger.log('--------------------------------------------------');

    return {
      httpCode: httpCode || 0,
      elapsedMs: elapsedOnError,
      responseLength: responseText.length
    };
  }
}

function customerSqlQuoteFika(value) {
  return "'" + String(value || '').replace(/'/g, "''") + "'";
}

function testFikaTabunganColumnIsolation() {
  Logger.log('');
  Logger.log('==================================================');
  Logger.log('TEST 7 - ISOLASI KOLOM PENYEBAB TIMEOUT');
  Logger.log('==================================================');

  var base =
    'FROM tabungan WHERE pelanggan = ' +
    customerSqlQuoteFika(FIKA_DIAGNOSTIC_CODE) +
    ' ORDER BY tanggal ASC,jam ASC,kode ASC LIMIT 100';

  runFikaDiagnosticQuery(
    'TEST 7A - BASE + KETERANGAN',
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,keterangan ' + base
  );

  runFikaDiagnosticQuery(
    'TEST 7B - BASE + KODE_KAS',
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,kode_kas ' + base
  );

  runFikaDiagnosticQuery(
    'TEST 7C - BASE + SUMBER',
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,sumber ' + base
  );

  runFikaDiagnosticQuery(
    'TEST 7D - BASE + SUMBER_FAKTUR',
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,sumber_faktur ' + base
  );

  runFikaDiagnosticQuery(
    'TEST 7E - BASE + KODE_KAS,SUMBER',
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,kode_kas,sumber ' + base
  );

  runFikaDiagnosticQuery(
    'TEST 7F - BASE + KODE_KAS,SUMBER_FAKTUR',
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,kode_kas,sumber_faktur ' + base
  );

  runFikaDiagnosticQuery(
    'TEST 7G - BASE + SUMBER,SUMBER_FAKTUR',
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,sumber,sumber_faktur ' + base
  );

  runFikaDiagnosticQuery(
    'TEST 7H - EXACT PRODUCTION COLUMNS',
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,keterangan,kode_kas,sumber,sumber_faktur ' + base
  );

  Logger.log('==================================================');
  Logger.log('TEST 7 SELESAI');
  Logger.log('==================================================');
}
