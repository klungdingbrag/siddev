/**
 * TB NUSANTARA - SUPPLIER HUTANG API V1
 * ============================================================
 * Read-only Supplier Hutang layer.
 *
 * SAFETY CONTRACT
 * - File ini sengaja terisolasi dari Code.gs.
 * - Tidak mengubah, mengganti, atau menghapus fungsi produksi lama.
 * - Tidak mendaftarkan action pada apiV1Dispatch_() pada tahap ini.
 * - Tidak melakukan INSERT / UPDATE / DELETE.
 * - Tidak mengubah kontrak Piutang, Customer, Dashboard, Tabungan, atau PDF.
 *
 * SOURCE OF TRUTH V1
 * - Supplier code  : pembelian.supplier
 * - Supplier name  : supplier.nama (LEFT JOIN supplier.kode)
 * - Outstanding    : pembelian.hutang
 * - Scope          : pembelian.hutang_ke = 'supplier' AND pembelian.hutang > 0
 *
 * Catatan:
 * itemhutang digunakan sebagai jejak alokasi pembayaran pada audit,
 * tetapi tidak dipakai untuk menghitung saldo berjalan V1 karena
 * pembelian.hutang sudah terbukti menyimpan sisa hutang aktual.
 *
 * Return pembelian belum dimasukkan ke perhitungan V1.
 * Jika kebutuhan bisnis nanti memerlukan rekonsiliasi return, audit
 * tersebut dibuat sebagai kontrak terpisah sebelum mengubah rumus.
 * ============================================================
 */

/**
 * Parse tanggal SID Retail format DD/MM/YYYY menjadi tanggal kalender.
 *
 * Aging memakai tanggal kalender, bukan jam, agar hasil tidak berubah
 * karena perbedaan jam/timezone browser.
 */
function supplierHutangParseDateV1(value) {
  var text = String(value == null ? '' : value).trim();
  var match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) {
    throw new Error(
      'Format tanggal supplier hutang tidak valid: ' + text
    );
  }

  var day = Number(match[1]);
  var month = Number(match[2]);
  var year = Number(match[3]);

  var date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(
      'Tanggal supplier hutang tidak valid: ' + text
    );
  }

  return date;
}

/**
 * Tanggal acuan aging berasal dari kalender backend.
 *
 * Session.getScriptTimeZone() digunakan agar "hari ini" mengikuti
 * timezone project GAS, bukan timezone browser user.
 */
function supplierHutangAgingReferenceDateV1() {
  var timezone = Session.getScriptTimeZone() || 'Asia/Jakarta';
  var todayText = Utilities.formatDate(
    new Date(),
    timezone,
    'dd/MM/yyyy'
  );

  return supplierHutangParseDateV1(todayText);
}

/**
 * Hitung umur hutang berdasarkan tanggal nota.
 */
function supplierHutangAgeV1(invoiceDate, referenceDate) {
  var invoice = supplierHutangParseDateV1(invoiceDate);
  var reference = referenceDate || supplierHutangAgingReferenceDateV1();

  var diffMs = reference.getTime() - invoice.getTime();
  var age = Math.floor(diffMs / 86400000);

  if (age < 0) {
    return 0;
  }

  return age;
}

/**
 * Map umur hutang ke contract aging V1.
 */
function supplierHutangAgingBucketV1(age) {
  var umur = Number(age);

  if (umur <= 30) {
    return 'Normal';
  }

  if (umur <= 60) {
    return 'Perlu Perhatian';
  }

  if (umur <= 120) {
    return 'Tinggi';
  }

  return 'Urgent';
}

function supplierHutangSqlQuoteV1(value) {
  return "'" + String(value == null ? '' : value).replace(/'/g, "''") + "'";
}

/**
 * Daftar supplier yang saat ini memiliki hutang pembelian.
 *
 * Output:
 * {
 *   status: 'success',
 *   data: [
 *     {
 *       kode_supplier,
 *       nama_supplier,
 *       jumlah_nota_bersaldo,
 *       total_hutang
 *     }
 *   ],
 *   source_contract: {...}
 * }
 *
 * Query fixed dan read-only. Tidak menerima SQL dari caller.
 */
function getSupplierHutangV1() {
  var query =
    'SELECT ' +
      'p.supplier AS kode_supplier,' +
      'COALESCE(NULLIF(TRIM(s.nama),\'\'), p.supplier) AS nama_supplier,' +
      'COUNT(*) AS jumlah_nota_bersaldo,' +
      'COALESCE(SUM(p.hutang),0) AS total_hutang ' +
    'FROM pembelian p ' +
    'LEFT JOIN supplier s ON s.kode = p.supplier ' +
    'WHERE p.hutang_ke = \'supplier\' ' +
      'AND COALESCE(p.hutang,0) > 0 ' +
    'GROUP BY p.supplier, s.nama ' +
    'ORDER BY total_hutang DESC, kode_supplier ASC';

  var result = sidRetailQuery(query);
  var rows = result && Array.isArray(result.data)
    ? result.data
    : [];

  var data = rows.map(function(row) {
    return {
      kode_supplier: String(row.kode_supplier || '').trim(),
      nama_supplier: String(row.nama_supplier || '').trim() ||
        String(row.kode_supplier || '').trim(),
      jumlah_nota_bersaldo: Number(row.jumlah_nota_bersaldo || 0),
      total_hutang: Number(row.total_hutang || 0)
    };
  });

  return {
    status: 'success',
    data: data,
    summary: {
      jumlah_supplier: data.length,
      total_hutang: data.reduce(function(total, item) {
        return total + item.total_hutang;
      }, 0)
    },
    source_contract: {
      supplier_code: 'pembelian.supplier',
      supplier_name: 'supplier.nama via supplier.kode',
      outstanding_balance: 'pembelian.hutang',
      scope: "pembelian.hutang_ke = 'supplier' AND pembelian.hutang > 0",
      payment_trace: 'itemhutang (diagnostic/allocation only)',
      return_adjustment: 'not included in V1'
    }
  };
}

/**
 * Detail nota hutang supplier.
 *
 * Hanya membaca invoice yang masih memiliki saldo hutang.
 * Tidak menghitung ulang saldo dari itemhutang.
 */
function getSupplierHutangDetailV1(kodeSupplier) {
  var kode = String(kodeSupplier || '').trim();

  if (!kode) {
    throw new Error('Kode supplier wajib diisi.');
  }

  if (!/^[a-zA-Z0-9._\- ]+$/.test(kode)) {
    throw new Error('Kode supplier tidak valid.');
  }

  var query =
    'SELECT ' +
      'p.kode AS nota,' +
      'p.tanggal AS tanggal,' +
      'COALESCE(p.jumlah,0) AS total_nota,' +
      'COALESCE(p.hutang,0) AS sisa_hutang,' +
      'p.lunas AS lunas,' +
      'p.kekurangan_sdh_dibayar AS kekurangan_sdh_dibayar ' +
    'FROM pembelian p ' +
    'WHERE p.supplier = ' + supplierHutangSqlQuoteV1(kode) + ' ' +
      "AND p.hutang_ke = 'supplier' " +
      'AND COALESCE(p.hutang,0) > 0 ' +
    'ORDER BY p.tanggal ASC, p.kode ASC ' +
    'LIMIT 500';

  var result = sidRetailQuery(query);
  var rows = result && Array.isArray(result.data)
    ? result.data
    : [];
  var agingReferenceDate = supplierHutangAgingReferenceDateV1();

  var data = rows.map(function(row) {
    var totalNota = Number(row.total_nota || 0);
    var sisaHutang = Number(row.sisa_hutang || 0);
    var tanggal = String(row.tanggal || '').trim();
    var umurHari = supplierHutangAgeV1(
      tanggal,
      agingReferenceDate
    );

    return {
      nota: String(row.nota || '').trim(),
      tanggal: tanggal,
      total_nota: totalNota,
      sisa_hutang: sisaHutang,
      umur_hari: umurHari,
      aging_bucket: supplierHutangAgingBucketV1(umurHari),
      status: sisaHutang > 0 ? 'OUTSTANDING' : 'LUNAS',
      lunas: String(row.lunas == null ? '' : row.lunas).trim(),
      kekurangan_sdh_dibayar:
        String(row.kekurangan_sdh_dibayar == null
          ? ''
          : row.kekurangan_sdh_dibayar).trim()
    };
  });

  return {
    status: 'success',
    supplier: {
      kode_supplier: kode
    },
    data: data,
    summary: {
      jumlah_nota_bersaldo: data.length,
      total_nilai_nota: data.reduce(function(total, item) {
        return total + item.total_nota;
      }, 0),
      total_hutang: data.reduce(function(total, item) {
        return total + item.sisa_hutang;
      }, 0)
    },
    source_contract: {
      supplier_code: 'pembelian.supplier',
      invoice: 'pembelian.kode',
      invoice_date: 'pembelian.tanggal',
      aging: 'umur_hari = tanggal_acuan_backend - pembelian.tanggal',
      aging_bucket: '0-30 Normal; 31-60 Perlu Perhatian; 61-120 Tinggi; >=121 Urgent',
      aging_reference_timezone: Session.getScriptTimeZone() || 'Asia/Jakarta',
      invoice_total: 'pembelian.jumlah',
      outstanding_balance: 'pembelian.hutang',
      scope: "pembelian.hutang_ke = 'supplier' AND pembelian.hutang > 0",
      limit: 500
    }
  };
}

/**
 * TEST TERISOLASI - LIST
 *
 * Jalankan langsung dari Apps Script.
 * Tidak melalui Web App dispatcher.
 */
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

/**
 * TEST TERISOLASI - DETAIL
 *
 * Jalankan langsung dari Apps Script.
 * Default JAYA dipilih karena audit menemukan banyak invoice outstanding.
 */
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

/**
 * TEST KONTRAK PARTIAL PAYMENT - AHE
 *
 * Kasus audit yang sudah terbukti:
 * total nota       = 12.105.000
 * alokasi bayar    = 2.000.000
 * pembelian.hutang = 10.105.000
 *
 * Fungsi ini hanya memeriksa nilai pembelian.hutang yang dibaca
 * oleh API V1. Tidak menghitung ulang saldo dan tidak menulis data.
 */
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


/**
 * TEST KONTRAK AGING V1
 *
 * Memvalidasi boundary contract tanpa query database.
 * Referensi tanggal dibuat eksplisit agar hasil deterministic.
 */
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


/**
 * TEST AGING BERDASARKAN DATA SUPPLIER AKTUAL V1
 * ------------------------------------------------------------
 * Tujuan:
 *   Memastikan aging yang dihitung oleh API bekerja pada data
 *   Supplier Hutang aktual, bukan hanya pada fixed contract test.
 *
 * Kasus utama:
 *   JAYA dipilih karena audit sebelumnya memverifikasi supplier
 *   ini memiliki banyak nota outstanding.
 *
 * Validasi:
 *   - data detail berhasil dibaca;
 *   - setiap nota memiliki umur_hari + aging_bucket;
 *   - total sisa_hutang tetap sama dengan summary API;
 *   - distribusi bucket dapat diamati;
 *
 * Mode:
 *   READ-ONLY
 *   Tidak menulis atau mengubah data.
 */
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

/**
 * TEST HTTP AGING V1
 * ------------------------------------------------------------
 * Memvalidasi aging melalui jalur Web App Development:
 *   GAS test -> Web App doGet -> apiV1Handle_ -> dispatcher
 *   -> getSupplierHutangDetailV1()
 *
 * Mode:
 *   READ-ONLY
 *
 * Validasi:
 *   - HTTP 2xx
 *   - envelope API success
 *   - payload supplier detail tersedia
 *   - field umur_hari + aging_bucket tersedia
 *   - summary total tetap konsisten dengan rows
 *   - source_contract memuat kontrak aging
 *
 * Default supplier: JAYA
 *
 * Catatan:
 *   Jalankan dari deployment Web App Development agar
 *   ScriptApp.getService().getUrl() menunjuk endpoint yang
 *   dapat diuji melalui HTTP.
 */
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

  var apiSuccess = !!json && json.status === 'success';
  var payload = apiSuccess && json.data && typeof json.data === 'object'
    ? json.data
    : {};

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
