# Arsip fungsi diagnosis dan pengujian GAS

> Fungsi di bawah ini dipindahkan dari source operasional. Arsip ini hanya untuk referensi dan tidak dimuat oleh GAS.

## `diagnosticCustomerDetailV3` (Code.gs)
```javascript
function diagnosticCustomerDetailV3(kodePelanggan) {
  var kode = String(kodePelanggan || '2606030').trim();
  var rounds = 5;

  if (!kode) throw new Error('Kode pelanggan kosong.');
  if (!/^[-a-zA-Z0-9._ ]+$/.test(kode)) {
    throw new Error('Kode pelanggan tidak valid.');
  }

  var endpoint = ScriptApp.getService().getUrl();
  if (!endpoint) {
    throw new Error('URL Web App tidak tersedia. Jalankan diagnostic ini dari deployment Web App Development.');
  }

  var detailUrl = endpoint + '?action=customerPiutangDetail&kode_pelanggan=' + encodeURIComponent(kode);
  var tabunganUrl = endpoint + '?action=tabungan&kode_pelanggan=' + encodeURIComponent(kode);
  var requestOptions = { method: 'get', muteHttpExceptions: true, followRedirects: true };

  var detailTimes = [], tabunganTimes = [], parallelTimes = [];
  var detailHttp = [], tabunganHttp = [], parallelDetailHttp = [], parallelTabunganHttp = [];

  Logger.log('==============================================');
  Logger.log('CUSTOMER DETAIL PERFORMANCE DIAGNOSTIC V3');
  Logger.log('KODE PELANGGAN: ' + kode);
  Logger.log('MODE: READ-ONLY');
  Logger.log('ROUNDS: ' + rounds);
  Logger.log('TEST: CONSISTENCY / SEQUENTIAL vs PARALLEL HTTP');
  Logger.log('==============================================');

  for (var i = 0; i < rounds; i++) {
    var round = i + 1;
    Logger.log('----------------------------------------------');
    Logger.log('ROUND ' + round);

    var detailStart = Date.now();
    var detailResponse = UrlFetchApp.fetch(detailUrl, requestOptions);
    var detailMs = Date.now() - detailStart;
    detailTimes.push(detailMs);
    detailHttp.push(detailResponse.getResponseCode());

    var tabunganStart = Date.now();
    var tabunganResponse = UrlFetchApp.fetch(tabunganUrl, requestOptions);
    var tabunganMs = Date.now() - tabunganStart;
    tabunganTimes.push(tabunganMs);
    tabunganHttp.push(tabunganResponse.getResponseCode());

    var parallelStart = Date.now();
    var parallelResponses = UrlFetchApp.fetchAll([
      { url: detailUrl, method: 'get', muteHttpExceptions: true, followRedirects: true },
      { url: tabunganUrl, method: 'get', muteHttpExceptions: true, followRedirects: true }
    ]);
    var parallelMs = Date.now() - parallelStart;
    parallelTimes.push(parallelMs);
    parallelDetailHttp.push(parallelResponses[0].getResponseCode());
    parallelTabunganHttp.push(parallelResponses[1].getResponseCode());

    Logger.log('DETAIL MS: ' + detailMs + ' | HTTP: ' + detailHttp[i]);
    Logger.log('TABUNGAN MS: ' + tabunganMs + ' | HTTP: ' + tabunganHttp[i]);
    Logger.log('PARALLEL MS: ' + parallelMs + ' | DETAIL HTTP: ' + parallelDetailHttp[i] + ' | TABUNGAN HTTP: ' + parallelTabunganHttp[i]);
  }

  function sum(values) {
    return values.reduce(function(total, value) { return total + Number(value || 0); }, 0);
  }
  function average(values) { return values.length ? sum(values) / values.length : 0; }
  function sorted(values) { return values.slice().sort(function(a, b) { return a - b; }); }
  function median(values) {
    if (!values.length) return 0;
    var s = sorted(values), middle = Math.floor(s.length / 2);
    return s.length % 2 ? s[middle] : (s[middle - 1] + s[middle]) / 2;
  }
  function countOver(values, threshold) {
    return values.filter(function(value) { return Number(value) > threshold; }).length;
  }
  function stats(values) {
    var s = sorted(values);
    return {
      min_ms: s.length ? s[0] : 0,
      max_ms: s.length ? s[s.length - 1] : 0,
      average_ms: average(values),
      median_ms: median(values),
      over_5000_ms: countOver(values, 5000),
      over_10000_ms: countOver(values, 10000),
      over_20000_ms: countOver(values, 20000),
      over_30000_ms: countOver(values, 30000)
    };
  }

  var detailStats = stats(detailTimes);
  var tabunganStats = stats(tabunganTimes);
  var parallelStats = stats(parallelTimes);

  Logger.log('==============================================');
  Logger.log('SUMMARY DETAIL | MIN=' + detailStats.min_ms + ' MAX=' + detailStats.max_ms + ' AVG=' + detailStats.average_ms.toFixed(1) + ' MEDIAN=' + detailStats.median_ms);
  Logger.log('DETAIL >5S=' + detailStats.over_5000_ms + ' >10S=' + detailStats.over_10000_ms + ' >20S=' + detailStats.over_20000_ms + ' >30S=' + detailStats.over_30000_ms);
  Logger.log('SUMMARY TABUNGAN | MIN=' + tabunganStats.min_ms + ' MAX=' + tabunganStats.max_ms + ' AVG=' + tabunganStats.average_ms.toFixed(1) + ' MEDIAN=' + tabunganStats.median_ms);
  Logger.log('TABUNGAN >5S=' + tabunganStats.over_5000_ms + ' >10S=' + tabunganStats.over_10000_ms + ' >20S=' + tabunganStats.over_20000_ms + ' >30S=' + tabunganStats.over_30000_ms);
  Logger.log('SUMMARY PARALLEL | MIN=' + parallelStats.min_ms + ' MAX=' + parallelStats.max_ms + ' AVG=' + parallelStats.average_ms.toFixed(1) + ' MEDIAN=' + parallelStats.median_ms);
  Logger.log('PARALLEL >5S=' + parallelStats.over_5000_ms + ' >10S=' + parallelStats.over_10000_ms + ' >20S=' + parallelStats.over_20000_ms + ' >30S=' + parallelStats.over_30000_ms);
  Logger.log('HTTP DETAIL: ' + JSON.stringify(detailHttp));
  Logger.log('HTTP TABUNGAN: ' + JSON.stringify(tabunganHttp));
  Logger.log('HTTP PARALLEL DETAIL: ' + JSON.stringify(parallelDetailHttp));
  Logger.log('HTTP PARALLEL TABUNGAN: ' + JSON.stringify(parallelTabunganHttp));
  Logger.log('==============================================');

  return {
    diagnostic: 'customer_detail_performance_v3',
    read_only: true,
    kode_pelanggan: kode,
    rounds: rounds,
    detail: { times_ms: detailTimes, http: detailHttp, stats: detailStats },
    tabungan: { times_ms: tabunganTimes, http: tabunganHttp, stats: tabunganStats },
    parallel: { times_ms: parallelTimes, detail_http: parallelDetailHttp, tabungan_http: parallelTabunganHttp, stats: parallelStats }
  };
}

```

## `testSupplierHutangV1` (Supplier_Hutang_API_V1.gs)
```javascript
function testSupplierHutangV1() {
  Logger.log('====================================================');
  Logger.log('SUPPLIER HUTANG API V1 - TEST LIST');
  Logger.log('MODE: READ-ONLY');
  Logger.log('====================================================');

  var started = Date.now();
  var result = getSupplierHutangV1();

  Logger.log(JSON.stringify(result));
  Logger.log('DURATION MS: ' + (Date.now() - started));
  Logger.log('====================================================');

  return result;
}

```

## `testSupplierHutangDetailV1` (Supplier_Hutang_API_V1.gs)
```javascript
function testSupplierHutangDetailV1(kodeSupplier) {
  var kode = String(kodeSupplier || 'JAYA').trim();

  Logger.log('====================================================');
  Logger.log('SUPPLIER HUTANG API V1 - TEST DETAIL');
  Logger.log('SUPPLIER: ' + kode);
  Logger.log('MODE: READ-ONLY');
  Logger.log('====================================================');

  var started = Date.now();
  var result = getSupplierHutangDetailV1(kode);

  Logger.log(JSON.stringify(result));
  Logger.log('DURATION MS: ' + (Date.now() - started));
  Logger.log('====================================================');

  return result;
}

```

## `testSupplierHutangPartialPaymentV1` (Supplier_Hutang_API_V1.gs)
```javascript
function testSupplierHutangPartialPaymentV1() {
  var kodeSupplier = 'AHE';
  var expectedNota = 'R21-060926001';
  var expectedBalance = 10105000;

  var result = getSupplierHutangDetailV1(kodeSupplier);
  var rows = result && Array.isArray(result.data) ? result.data : [];

  var match = rows.filter(function(row) {
    return row.nota === expectedNota;
  })[0] || null;

  var passed = !!match &&
    Number(match.sisa_hutang) === expectedBalance;

  Logger.log('====================================================');
  Logger.log('SUPPLIER HUTANG PARTIAL PAYMENT CONTRACT TEST');
  Logger.log('SUPPLIER: ' + kodeSupplier);
  Logger.log('NOTA: ' + expectedNota);
  Logger.log('EXPECTED SISA: ' + expectedBalance);
  Logger.log('ACTUAL SISA: ' + (match ? match.sisa_hutang : 'NOT FOUND'));
  Logger.log('RESULT: ' + (passed ? 'PASS' : 'FAIL'));
  Logger.log('====================================================');

  return {
    status: passed ? 'pass' : 'fail',
    supplier: kodeSupplier,
    nota: expectedNota,
    expected_sisa_hutang: expectedBalance,
    actual_sisa_hutang: match ? match.sisa_hutang : null
  };
}

```

## `testSupplierHutangAgingV1` (Supplier_Hutang_API_V1.gs)
```javascript
function testSupplierHutangAgingV1() {
  var referenceDate = supplierHutangParseDateV1('09/10/2026');

  var cases = [
    { tanggal: '09/10/2026', expectedAge: 0, expectedBucket: 'Normal' },
    { tanggal: '09/09/2026', expectedAge: 30, expectedBucket: 'Normal' },
    { tanggal: '10/08/2026', expectedAge: 60, expectedBucket: 'Perlu Perhatian' },
    { tanggal: '10/06/2026', expectedAge: 121, expectedBucket: 'Urgent' }
  ];

  var results = cases.map(function(testCase) {
    var age = supplierHutangAgeV1(
      testCase.tanggal,
      referenceDate
    );
    var bucket = supplierHutangAgingBucketV1(age);
    var passed =
      age === testCase.expectedAge &&
      bucket === testCase.expectedBucket;

    return {
      tanggal: testCase.tanggal,
      umur_hari: age,
      aging_bucket: bucket,
      expected_umur_hari: testCase.expectedAge,
      expected_aging_bucket: testCase.expectedBucket,
      status: passed ? 'PASS' : 'FAIL'
    };
  });

  var passedAll = results.every(function(item) {
    return item.status === 'PASS';
  });

  Logger.log('====================================================');
  Logger.log('SUPPLIER HUTANG AGING V1 - CONTRACT TEST');
  Logger.log(JSON.stringify(results));
  Logger.log('RESULT: ' + (passedAll ? 'PASS' : 'FAIL'));
  Logger.log('====================================================');

  return {
    status: passedAll ? 'pass' : 'fail',
    reference_date: '09/10/2026',
    cases: results
  };
}

```

## `testSupplierHutangAgingDataV1` (Supplier_Hutang_API_V1.gs)
```javascript
function testSupplierHutangAgingDataV1(kodeSupplier) {
  var kode = String(kodeSupplier || 'JAYA').trim();
  var started = Date.now();

  var result = getSupplierHutangDetailV1(kode);
  var rows = result && Array.isArray(result.data)
    ? result.data
    : [];
  var summary = result && result.summary
    ? result.summary
    : {};

  var bucketCounts = {
    Normal: 0,
    'Perlu Perhatian': 0,
    Tinggi: 0,
    Urgent: 0
  };

  var totalHutangFromRows = 0;

  rows.forEach(function(row) {
    var bucket = String(row.aging_bucket || '').trim();

    if (Object.prototype.hasOwnProperty.call(bucketCounts, bucket)) {
      bucketCounts[bucket] += 1;
    }

    totalHutangFromRows += Number(row.sisa_hutang || 0);
  });

  var summaryTotal = Number(summary.total_hutang || 0);
  var balanceMatch =
    Math.abs(totalHutangFromRows - summaryTotal) < 0.01;

  var fieldsComplete = rows.every(function(row) {
    return (
      row.tanggal &&
      Number.isFinite(Number(row.umur_hari)) &&
      row.aging_bucket
    );
  });

  var passed = rows.length > 0 &&
    balanceMatch &&
    fieldsComplete;

  Logger.log('====================================================');
  Logger.log('SUPPLIER HUTANG AGING V1 - ACTUAL DATA TEST');
  Logger.log('MODE: READ-ONLY');
  Logger.log('SUPPLIER: ' + kode);
  Logger.log('ROWS: ' + rows.length);
  Logger.log('SUMMARY TOTAL HUTANG: ' + summaryTotal);
  Logger.log('ROWS TOTAL HUTANG: ' + totalHutangFromRows);
  Logger.log('BALANCE MATCH: ' + (balanceMatch ? 'PASS' : 'FAIL'));
  Logger.log('FIELDS COMPLETE: ' + (fieldsComplete ? 'PASS' : 'FAIL'));
  Logger.log('BUCKET COUNTS: ' + JSON.stringify(bucketCounts));
  Logger.log('SAMPLE: ' + JSON.stringify(rows.slice(0, 10)));
  Logger.log('RESULT: ' + (passed ? 'PASS' : 'FAIL'));
  Logger.log('DURATION MS: ' + (Date.now() - started));
  Logger.log('====================================================');

  return {
    status: passed ? 'pass' : 'fail',
    supplier: kode,
    row_count: rows.length,
    summary_total_hutang: summaryTotal,
    rows_total_hutang: totalHutangFromRows,
    balance_match: balanceMatch,
    fields_complete: fieldsComplete,
    bucket_counts: bucketCounts,
    sample: rows.slice(0, 10),
    duration_ms: Date.now() - started
  };
}

```

## `testSupplierHutangAgingHttpV1` (Supplier_Hutang_API_V1.gs)
```javascript
function testSupplierHutangAgingHttpV1(kodeSupplier) {
  var kode = String(kodeSupplier || 'JAYA').trim();

  if (!kode) {
    throw new Error('Kode supplier kosong.');
  }

  if (!/^[-a-zA-Z0-9._ ]+$/.test(kode)) {
    throw new Error('Kode supplier tidak valid.');
  }

  var endpoint = ScriptApp.getService().getUrl();

  if (!endpoint) {
    throw new Error(
      'URL Web App tidak tersedia. Jalankan test ini dari deployment Web App Development.'
    );
  }

  var url = endpoint +
    '?action=supplierHutangDetail&kode_supplier=' +
    encodeURIComponent(kode);

  var started = Date.now();
  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true
  });

  var durationMs = Date.now() - started;
  var httpCode = response.getResponseCode();
  var responseText = response.getContentText();

  var json = null;
  var jsonValid = true;

  try {
    json = JSON.parse(responseText);
  } catch (e) {
    jsonValid = false;
  }

  // Web App API V1 memiliki envelope luar:
  // { success: true, api_version: 'v1', action: '...', data: {...} }
  // Sedangkan payload Supplier Hutang di dalamnya memiliki:
  // { status: 'success', data: [...], summary: {...} }
  var envelopeSuccess = !!json && json.success === true;
  var payload = envelopeSuccess && json.data && typeof json.data === 'object'
    ? json.data
    : {};
  var apiSuccess = envelopeSuccess && payload.status === 'success';

  var rows = Array.isArray(payload.data)
    ? payload.data
    : [];

  var summary = payload.summary || {};
  var sourceContract = payload.source_contract || {};

  var fieldsComplete = rows.length > 0 && rows.every(function(row) {
    return (
      row.tanggal &&
      Number.isFinite(Number(row.umur_hari)) &&
      row.aging_bucket
    );
  });

  var rowsTotalHutang = rows.reduce(function(total, row) {
    return total + Number(row.sisa_hutang || 0);
  }, 0);

  var summaryTotalHutang = Number(summary.total_hutang || 0);
  var balanceMatch =
    Math.abs(rowsTotalHutang - summaryTotalHutang) < 0.01;

  var agingContractPresent =
    String(sourceContract.aging || '').indexOf('umur_hari') >= 0 &&
    String(sourceContract.aging_bucket || '').indexOf('Urgent') >= 0;

  var httpPass = httpCode >= 200 && httpCode < 300;
  var passed =
    httpPass &&
    jsonValid &&
    apiSuccess &&
    rows.length > 0 &&
    fieldsComplete &&
    balanceMatch &&
    agingContractPresent;

  Logger.log('====================================================');
  Logger.log('SUPPLIER HUTANG AGING V1 - HTTP TEST');
  Logger.log('MODE: READ-ONLY');
  Logger.log('SUPPLIER: ' + kode);
  Logger.log('URL: ' + url);
  Logger.log('HTTP CODE: ' + httpCode);
  Logger.log('JSON VALID: ' + (jsonValid ? 'PASS' : 'FAIL'));
  Logger.log('API STATUS: ' + (apiSuccess ? 'PASS' : 'FAIL'));
  Logger.log('ROWS: ' + rows.length);
  Logger.log('FIELDS COMPLETE: ' + (fieldsComplete ? 'PASS' : 'FAIL'));
  Logger.log('SUMMARY TOTAL HUTANG: ' + summaryTotalHutang);
  Logger.log('ROWS TOTAL HUTANG: ' + rowsTotalHutang);
  Logger.log('BALANCE MATCH: ' + (balanceMatch ? 'PASS' : 'FAIL'));
  Logger.log('AGING CONTRACT: ' + (agingContractPresent ? 'PASS' : 'FAIL'));
  Logger.log('SAMPLE: ' + JSON.stringify(rows.slice(0, 5)));
  Logger.log('RESULT: ' + (passed ? 'PASS' : 'FAIL'));
  Logger.log('DURATION MS: ' + durationMs);
  Logger.log('====================================================');

  return {
    status: passed ? 'pass' : 'fail',
    supplier: kode,
    http_code: httpCode,
    json_valid: jsonValid,
    api_success: apiSuccess,
    row_count: rows.length,
    fields_complete: fieldsComplete,
    summary_total_hutang: summaryTotalHutang,
    rows_total_hutang: rowsTotalHutang,
    balance_match: balanceMatch,
    aging_contract_present: agingContractPresent,
    sample: rows.slice(0, 5),
    duration_ms: durationMs
  };
}

```

