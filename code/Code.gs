/**
 * TB NUSANTARA - PIUTANG AGING V3
 * Ini adalah Code.gs yang sebelumnya TB_NUSANTARA_CODE_UNIFIED_V1
 * Arsitektur:
 * 1. Tidak menggunakan SQL JOIN.
 * 2. Aging bersumber dari transaksi penjualan outstanding.
 * 3. Penjualan diambil secara batch kecil.
 * 4. Master pelanggan TIDAK diambil massal.
 * 5. Nama fallback berasal dari nama_pelanggan pada transaksi.
 * 6. Kontak pelanggan diambil on-demand saat dibutuhkan.
 * 7. Detail transaksi diambil on-demand.
 */

const SID_CONFIG = {
  API_PROPERTY_NAME: 'SID_API_KEY',
  BASE_URL: 'https://sidretail.id/api/',
  TRX_CODE: 'TRX0001',
  TRANSACTION_BATCH_SIZE: 500,
  MAX_TRANSACTION_BATCHES: 100,
  REQUEST_DELAY_MS: 150,
  RETRY_COUNT: 2,
  RETRY_DELAY_MS: 1000,
  DETAIL_LIMIT: 500
};

/*
 * Generator kode transaksi yang aman untuk request berurutan maupun paralel.
 *
 * Apps Script dapat menjalankan beberapa execution secara bersamaan.
 * Variabel global tidak dijadikan sumber keunikan karena tidak dijamin
 * dibagi antar execution.
 *
 * Strategi:
 * 1. LockService mencegah dua execution membuat kode yang sama.
 * 2. Script Properties menyimpan kode terakhir antar execution.
 * 3. Basis kode tetap Unix timestamp dalam detik.
 * 4. Jika request terjadi pada detik yang sama, kode dinaikkan +1.
 */
const LAST_TRX_CODE_PROPERTY = 'SID_LAST_TRX_CODE';

function validateConfig() {
  const apiKey = PropertiesService.getScriptProperties().getProperty(SID_CONFIG.API_PROPERTY_NAME);
  if (!apiKey) throw new Error('SID_API_KEY belum tersedia di Script Properties.');
  return {
    status: 'success',
    base_url: SID_CONFIG.BASE_URL,
    trx_code: SID_CONFIG.TRX_CODE,
    api_key_available: true
  };
}

function getApiKey() {
  const apiKey = PropertiesService.getScriptProperties().getProperty(SID_CONFIG.API_PROPERTY_NAME);
  if (!apiKey) throw new Error('SID_API_KEY belum tersedia di Script Properties.');
  return apiKey;
}

function generateTrxCode() {
  const lock = LockService.getScriptLock();

  // Mencegah execution paralel menghasilkan kode yang sama.
  lock.waitLock(10000);

  try {
    const properties = PropertiesService.getScriptProperties();

    const nowUnixSeconds = Math.floor(Date.now() / 1000);
    const lastStored = Number(
      properties.getProperty(LAST_TRX_CODE_PROPERTY) || '0'
    );

    // Selalu lebih besar dari kode terakhir.
    const currentCode = Math.max(nowUnixSeconds, lastStored + 1);
    const trxCode = String(currentCode);

    properties.setProperty(LAST_TRX_CODE_PROPERTY, trxCode);

    Logger.log('GENERATED UNIQUE TRX CODE: ' + trxCode);

    return trxCode;
  } finally {
    lock.releaseLock();
  }
}

function sidRetailQuery(query) {
  if (!query) throw new Error('Query SID Retail tidak boleh kosong.');

  const apiKey = getApiKey();
  const trxCode = generateTrxCode();
  const url = SID_CONFIG.BASE_URL + encodeURIComponent(apiKey) + '/' +
    encodeURIComponent(trxCode) + '/' + encodeURIComponent(query);

  Logger.log('======================================');
  Logger.log('SID RETAIL REQUEST');
  Logger.log('TRX CODE: ' + trxCode);
  Logger.log('QUERY: ' + query);

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true
  });

  const httpCode = response.getResponseCode();
  const responseText = response.getContentText();

  Logger.log('HTTP CODE: ' + httpCode);

  if (!responseText) throw new Error('SID Retail tidak memberikan response.');

  let json;
  try {
    json = JSON.parse(responseText);
  } catch (e) {
    throw new Error('Response SID Retail bukan JSON valid.');
  }

  Logger.log('API STATUS: ' + (json.status || '(tidak tersedia)'));

  if (httpCode < 200 || httpCode >= 300) {
    throw new Error(
      'HTTP Error ' + httpCode + ': ' + responseText.substring(0, 500)
    );
  }

  /*
   * SID Retail dapat mengembalikan HTTP 200 tetapi status API = error.
   * Error API dilempar agar mekanisme retry membuat kode_trx BARU.
   */
  if (json.status && String(json.status).toLowerCase() !== 'success') {
    const apiMessage =
      json.result ||
      json.message ||
      json.error ||
      'SID Retail mengembalikan status error.';

    throw new Error(
      'SID Retail API ERROR | TRX CODE ' + trxCode + ' | ' + apiMessage
    );
  }

  return json;
}

function testSidApiConnection() {
  const result = sidRetailQuery('SELECT kode,nama FROM pelanggan LIMIT 1');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Diagnostic generator kode_trx.
 * Membuat 5 kode berturut-turut tanpa mengakses tabel SID Retail.
 */
function testTrxCodeUniqueness() {
  const codes = [];

  for (let i = 0; i < 5; i++) {
    codes.push(generateTrxCode());
  }

  const uniqueCodes = {};
  codes.forEach(function(code) {
    uniqueCodes[code] = true;
  });

  const uniqueCount = Object.keys(uniqueCodes).length;

  const result = {
    status: uniqueCount === codes.length ? 'success' : 'error',
    generated: codes.length,
    unique: uniqueCount,
    duplicate: codes.length - uniqueCount,
    codes: codes
  };

  Logger.log('TRX CODE UNIQUENESS TEST:');
  Logger.log(JSON.stringify(result, null, 2));

  if (result.duplicate > 0) {
    throw new Error(
      'Generator kode_trx menghasilkan duplikat: ' +
      JSON.stringify(result)
    );
  }

  return result;
}

/**
 * LAPORAN UTAMA V3
 * Tidak pernah mengambil seluruh tabel pelanggan.
 */
function getPiutangPelangganLaporan() {
  const reportStart = Date.now();
  Logger.log('======================================');
  Logger.log('LAPORAN AGING PIUTANG V3');
  Logger.log('MODE: TRANSACTION-FIRST + BATCH + NO JOIN');
  Logger.log('======================================');

  const transactions = fetchOutstandingSalesInBatches();
  const today = startOfDay(new Date());
  const customerMap = {};
  let totalPiutang = 0;
  let totalUnclassified = 0;
  let totalTransactions = 0;

  transactions.forEach(function(row) {
    const kode = String(row.pelanggan || '').trim();
    const piutang = parseMoney(row.piutang);
    if (!kode || piutang <= 0) return;

    if (!customerMap[kode]) {
      customerMap[kode] = {
        kd_pelanggan: kode,
        nm_pelanggan: String(row.nama_pelanggan || '').trim(),
        belum_jatuh_tempo: 0,
        aging_1_30: 0,
        aging_31_60: 0,
        aging_61_90: 0,
        aging_91_120: 0,
        aging_121_plus: 0,
        total_piutang: 0,
        unclassified: 0
      };
    } else if (!customerMap[kode].nm_pelanggan && row.nama_pelanggan) {
      customerMap[kode].nm_pelanggan = String(row.nama_pelanggan).trim();
    }

    const customer = customerMap[kode];
    const tanggalTransaksi = parseSidDate(row.tanggal);
    const jtHari = parseJtDays(row.jt);
    let bucket = 'unclassified';

    if (tanggalTransaksi && jtHari !== null) {
      const jatuhTempo = addDays(tanggalTransaksi, jtHari);
      const umurHari = Math.floor(
        (today.getTime() - jatuhTempo.getTime()) / 86400000
      );

      if (umurHari <= 0) bucket = 'belum_jatuh_tempo';
      else if (umurHari <= 30) bucket = 'aging_1_30';
      else if (umurHari <= 60) bucket = 'aging_31_60';
      else if (umurHari <= 90) bucket = 'aging_61_90';
      else if (umurHari <= 120) bucket = 'aging_91_120';
      else bucket = 'aging_121_plus';
    }

    customer[bucket] += piutang;
    customer.total_piutang += piutang;
    if (bucket === 'unclassified') {
      customer.unclassified += piutang;
      totalUnclassified += piutang;
    }

    totalPiutang += piutang;
    totalTransactions++;
  });

  const data = Object.keys(customerMap).map(function(kode) {
    const item = customerMap[kode];
    return {
      kd_pelanggan: item.kd_pelanggan,
      nm_pelanggan: item.nm_pelanggan || item.kd_pelanggan,
      telp: '',
      alamat: '',
      belum_jatuh_tempo: item.belum_jatuh_tempo,
      aging_1_30: item.aging_1_30,
      aging_31_60: item.aging_31_60,
      aging_61_90: item.aging_61_90,
      aging_91_120: item.aging_91_120,
      aging_121_plus: item.aging_121_plus,
      total_piutang: item.total_piutang,
      unclassified: item.unclassified
    };
  });

  data.sort(function(a, b) {
    return String(a.nm_pelanggan).localeCompare(String(b.nm_pelanggan), 'id');
  });

  Logger.log('TOTAL TRANSAKSI OUTSTANDING: ' + transactions.length);
  Logger.log('TOTAL TRANSAKSI TERPROSES: ' + totalTransactions);
  Logger.log('JUMLAH PELANGGAN: ' + data.length);
  Logger.log('TOTAL PIUTANG: ' + totalPiutang);
  Logger.log('TOTAL UNCLASSIFIED: ' + totalUnclassified);
  Logger.log('AGING V3 SELESAI');
  Logger.log('TOTAL WAKTU LAPORAN: ' + ((Date.now() - reportStart) / 1000).toFixed(3) + ' detik');

  return {
    status: 'success',
    mode: 'transaction-first-v3',
    data: data,
    total_transactions: transactions.length,
    total_processed_transactions: totalTransactions,
    total_pelanggan: data.length,
    total_piutang: totalPiutang,
    total_unclassified: totalUnclassified,
    reconciliation_difference: null,
    reconciliation_status: 'not_calculated_in_v3'
  };
}

/**
 * Ambil transaksi outstanding secara batch.
 */
function fetchOutstandingSalesInBatches() {
  const all = [];
  const batchSize = SID_CONFIG.TRANSACTION_BATCH_SIZE;
  let lastKode = '';

  for (let batchNo = 1; batchNo <= SID_CONFIG.MAX_TRANSACTION_BATCHES; batchNo++) {
    let query =
      'SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,piutang ' +
      'FROM penjualan ' +
      'WHERE piutang > 0 ';

    // Keyset pagination: tidak memakai OFFSET.
    // Karena urutan query juga berdasarkan kode, batch berikutnya
    // dimulai setelah kode terakhir batch sebelumnya.
    if (lastKode !== '') {
      query += "AND kode > '" + lastKode.replace(/'/g, "''") + "' ";
    }

    query +=
      'ORDER BY kode ' +
      'LIMIT ' + batchSize;

    Logger.log('BATCH ' + batchNo + ' | CURSOR ' + (lastKode || '(awal)'));

    let result = null;
    let lastError = null;

    for (let attempt = 1; attempt <= SID_CONFIG.RETRY_COUNT + 1; attempt++) {
      try {
        result = sidRetailQuery(query);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        Logger.log(
          'BATCH ' + batchNo + ' | ATTEMPT ' + attempt +
          ' GAGAL: ' + (error && error.message ? error.message : String(error))
        );

        if (attempt <= SID_CONFIG.RETRY_COUNT) {
          Utilities.sleep(SID_CONFIG.RETRY_DELAY_MS);
          Logger.log('RETRY BATCH ' + batchNo + ' | ATTEMPT ' + (attempt + 1));
        }
      }
    }

    if (lastError) {
      throw new Error(
        'Gagal mengambil batch transaksi #' + batchNo +
        ' setelah ' + (SID_CONFIG.RETRY_COUNT + 1) + ' percobaan: ' +
        (lastError.message || lastError)
      );
    }

    if (!result || result.status !== 'success') {
      throw new Error(
        'Gagal mengambil batch transaksi #' + batchNo + ': ' +
        JSON.stringify(result)
      );
    }

    const rows = Array.isArray(result.data) ? result.data : [];
    Logger.log('BATCH ' + batchNo + ': ' + rows.length + ' rows');
    all.push.apply(all, rows);

    if (rows.length === 0) {
      Logger.log('BATCH KOSONG / SELESAI: ' + batchNo);
      break;
    }

    const newLastKode = String(rows[rows.length - 1].kode || '').trim();

    if (!newLastKode) {
      throw new Error(
        'Batch #' + batchNo + ' tidak memiliki kode transaksi pada baris terakhir. ' +
        'Keyset pagination tidak aman dilanjutkan.'
      );
    }

    if (lastKode !== '' && newLastKode <= lastKode) {
      throw new Error(
        'Cursor tidak bergerak pada batch #' + batchNo +
        '. Kode terakhir=' + newLastKode + ', cursor sebelumnya=' + lastKode
      );
    }

    lastKode = newLastKode;

    if (rows.length < batchSize) {
      Logger.log('BATCH TERAKHIR: ' + batchNo);
      break;
    }

    Utilities.sleep(SID_CONFIG.REQUEST_DELAY_MS);
  }

  if (all.length >= SID_CONFIG.MAX_TRANSACTION_BATCHES * batchSize) {
    throw new Error(
      'Batas maksimum batch tercapai (' + SID_CONFIG.MAX_TRANSACTION_BATCHES +
      '). Data mungkin belum seluruhnya terbaca.'
    );
  }

  Logger.log('TOTAL TRANSAKSI TERAMBIL: ' + all.length);
  return all;
}

/**
 * Validasi apakah kode transaksi unik pada data outstanding.
 * Digunakan sebelum keyset pagination dijadikan metode produksi penuh.
 */
function testOutstandingKodeUniqueness() {
  const query =
    'SELECT kode,COUNT(*) AS jumlah ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ' +
    'GROUP BY kode ' +
    'HAVING COUNT(*) > 1 ' +
    'LIMIT 20';

  const result = sidRetailQuery(query);
  if (!result || result.status !== 'success') {
    throw new Error('Gagal memeriksa keunikan kode transaksi.');
  }

  const duplicates = Array.isArray(result.data) ? result.data : [];
  Logger.log('DUPLIKAT KODE OUTSTANDING: ' + duplicates.length);
  Logger.log(JSON.stringify(duplicates, null, 2));

  return {
    status: duplicates.length === 0 ? 'PASS' : 'CHECK_REQUIRED',
    duplicate_count: duplicates.length,
    duplicates: duplicates
  };
}

/**
 * Detail transaksi pelanggan — on demand.
 */
function getDetailPiutangPelanggan(kodePelanggan) {
  const kode = String(kodePelanggan || '').trim();
  if (!kode) throw new Error('Kode pelanggan kosong.');
  if (!/^[a-zA-Z0-9._\- ]+$/.test(kode)) throw new Error('Kode pelanggan tidak valid.');

  /*
   * PENTING:
   * - Hanya fungsi Detail yang diubah.
   * - Tidak menggunakan ORDER BY di SQL agar query detail tetap ringan.
   * - Pengurutan dilakukan setelah data diterima oleh Apps Script.
   * - Laporan utama getPiutangPelangganLaporan() tidak disentuh.
   */
  const query =
    "SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,piutang " +
    "FROM penjualan WHERE pelanggan = '" + kode.replace(/'/g, "''") + "' " +
    'AND piutang > 0 LIMIT ' + SID_CONFIG.DETAIL_LIMIT;

  const result = sidRetailQuery(query);
  if (!result || result.status !== 'success') {
    throw new Error('Gagal mengambil detail pelanggan: ' + JSON.stringify(result));
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  const today = startOfDay(new Date());

  const detail = rows.map(function(row) {
    const tanggalTransaksi = parseSidDate(row.tanggal);
    const jtHari = parseJtDays(row.jt);
    const jatuhTempo = (
      tanggalTransaksi && jtHari !== null
    ) ? addDays(tanggalTransaksi, jtHari) : null;

    const umurHari = jatuhTempo
      ? Math.floor(
          (today.getTime() - startOfDay(jatuhTempo).getTime()) / 86400000
        )
      : null;

    return {
      kode_transaksi: row.kode || '',
      tanggal: row.tanggal || '',
      pelanggan: row.pelanggan || kode,
      nama_pelanggan: row.nama_pelanggan || '',
      jt_hari: jtHari,
      jatuh_tempo: formatSidDate(jatuhTempo),
      umur_hari: umurHari,
      piutang: parseMoney(row.piutang)
    };
  });

  detail.sort(function(a, b) {
    const umurA = a.umur_hari === null || a.umur_hari === undefined ? -999999 : Number(a.umur_hari);
    const umurB = b.umur_hari === null || b.umur_hari === undefined ? -999999 : Number(b.umur_hari);
    if (umurA !== umurB) return umurB - umurA;

    const tanggalA = String(a.tanggal || '');
    const tanggalB = String(b.tanggal || '');
    if (tanggalA !== tanggalB) return tanggalA.localeCompare(tanggalB);

    return String(a.kode_transaksi || '').localeCompare(String(b.kode_transaksi || ''));
  });

  let contact = {
    nama: '',
    telp: '',
    alamat: ''
  };

  try {
    contact = getCustomerContactOnDemand(kode) || contact;
  } catch (contactError) {
    Logger.log(
      'DETAIL CONTACT GAGAL | KODE=' + kode +
      ' | ERROR=' +
      (contactError && contactError.message
        ? contactError.message
        : String(contactError))
    );
  }

  return {
    status: 'success',
    kode_pelanggan: kode,
    nama_pelanggan: contact.nama || (detail[0] && detail[0].nama_pelanggan) || kode,
    telp: contact.telp || '',
    alamat: contact.alamat || '',
    count: detail.length,
    data: detail
  };
}

/**
 * Contact/name lookup hanya ketika dibutuhkan.
 */
/**
 * ============================================================
 * TAHAP 5 - NOTA TRANSAKSI
 * ============================================================
 * Read-only.
 * Mengambil header penjualan + itempenjualan untuk satu transaksi.
 */
function getNotaTransaksi(kodeTransaksi) {
  const kode = String(kodeTransaksi || '').trim();

  if (!kode) {
    throw new Error('Kode transaksi kosong.');
  }

  if (!/^[a-zA-Z0-9._\- ]+$/.test(kode)) {
    throw new Error('Kode transaksi tidak valid.');
  }

  const escapedKode = kode.replace(/'/g, "''");

  const headerQuery =
    'SELECT kode,tanggal,pelanggan,nama_pelanggan,' +
    'alamat_pelanggan,alamat_pelanggan2,alamat_pelanggan3,' +
    'alamat_pengiriman,telp_pelanggan,jt,' +
    'jumlah,bayar,angsuran,piutang ' +
    'FROM penjualan ' +
    "WHERE kode = '" + escapedKode + "' " +
    'LIMIT 1';

  const headerResult = sidRetailQuery(headerQuery);

  if (!headerResult || headerResult.status !== 'success') {
    throw new Error(
      'Gagal mengambil header transaksi: ' +
      JSON.stringify(headerResult)
    );
  }

  const headerRows = Array.isArray(headerResult.data)
    ? headerResult.data
    : [];

  if (!headerRows.length) {
    throw new Error('Transaksi tidak ditemukan: ' + kode);
  }

  const row = headerRows[0];

  const returnedKode = String(row.kode || '').trim();
  if (returnedKode !== kode) {
    throw new Error(
      'Validasi kode transaksi gagal. Diminta=' +
      kode + ', diterima=' + returnedKode
    );
  }

  const tanggalTransaksi = parseSidDate(row.tanggal);
  const jtHari = parseJtDays(row.jt);
  const jatuhTempo = (
    tanggalTransaksi && jtHari !== null
  ) ? addDays(tanggalTransaksi, jtHari) : null;

  const ITEM_LIMIT = 501;

  const itemQuery =
    'SELECT nourut,kode,kode_barang,nama_barang,satuan,' +
    'qty,harga,diskon,diskon_rupiah,subtotal ' +
    'FROM itempenjualan ' +
    "WHERE kode = '" + escapedKode + "' " +
    'LIMIT ' + ITEM_LIMIT;

  const itemResult = sidRetailQuery(itemQuery);

  if (!itemResult || itemResult.status !== 'success') {
    throw new Error(
      'Gagal mengambil item transaksi: ' +
      JSON.stringify(itemResult)
    );
  }

  const itemRows = Array.isArray(itemResult.data)
    ? itemResult.data
    : [];

  if (itemRows.length > 500) {
    throw new Error(
      'Transaksi ' + kode +
      ' memiliki lebih dari 500 item. ' +
      'Pagination item diperlukan sebelum transaksi ini dapat dicetak.'
    );
  }

  const items = itemRows.map(function(item, index) {
    const itemKode = String(item.kode || '').trim();

    if (itemKode !== kode) {
      throw new Error(
        'Item transaksi tidak cocok. Transaksi=' +
        kode + ', item.kode=' + itemKode
      );
    }

    const nourutNumber = Number(String(item.nourut || '').trim());
    const qty = parseNotaStage5Number_(item.qty);
    const harga = parseMoney(item.harga);
    const diskon = parseMoney(item.diskon);
    const diskonRupiah = parseMoney(item.diskon_rupiah);
    const subtotal = parseMoney(item.subtotal);

    return {
      no: isFinite(nourutNumber) && nourutNumber > 0
        ? nourutNumber
        : index + 1,
      kode_barang: item.kode_barang || '',
      nama_barang: item.nama_barang || '',
      satuan: item.satuan || '',
      qty: qty,
      harga: harga,
      diskon: diskon,
      diskon_rupiah: diskonRupiah,
      subtotal: subtotal
    };
  });

  items.sort(function(a, b) {
    if (a.no !== b.no) return a.no - b.no;
    return String(a.kode_barang || '').localeCompare(
      String(b.kode_barang || '')
    );
  });

  const jumlah = parseMoney(row.jumlah);
  const bayar = parseMoney(row.bayar);
  const angsuran = parseMoney(row.angsuran);
  const piutang = parseMoney(row.piutang);

  let subtotalItems = 0;
  items.forEach(function(item) {
    subtotalItems += item.subtotal;
  });

  const selisihJumlah = jumlah - subtotalItems;
  const expectedPiutang = jumlah - bayar - angsuran;
  const selisihPiutang = piutang - expectedPiutang;

  if (Math.abs(selisihJumlah) > 0.01) {
    throw new Error(
      'Validasi total Nota gagal untuk ' + kode +
      '. penjualan.jumlah=' + jumlah +
      ', SUM(itempenjualan.subtotal)=' + subtotalItems
    );
  }

  if (Math.abs(selisihPiutang) > 0.01) {
    throw new Error(
      'Validasi piutang gagal untuk ' + kode +
      '. piutang=' + piutang +
      ', expected=' + expectedPiutang
    );
  }

  return {
    status: 'success',
    header: {
      kode_transaksi: kode,
      tanggal: row.tanggal || '',
      jt_hari: jtHari,
      jatuh_tempo: formatSidDate(jatuhTempo),
      kode_pelanggan: row.pelanggan || '',
      nama_pelanggan: row.nama_pelanggan || '',
      alamat_pelanggan: row.alamat_pelanggan || '',
      alamat_pelanggan2: row.alamat_pelanggan2 || '',
      alamat_pelanggan3: row.alamat_pelanggan3 || '',
      alamat_pengiriman: row.alamat_pengiriman || '',
      telp_pelanggan: row.telp_pelanggan || ''
    },
    items: items,
    summary: {
      jumlah: jumlah,
      bayar: bayar,
      angsuran: angsuran,
      piutang: piutang,
      total_item: items.length
    }
  };
}

function parseNotaStage5Number_(value) {
  if (value === null || value === undefined || value === '') return 0;

  if (typeof value === 'number') {
    return isFinite(value) ? value : 0;
  }

  const n = Number(
    String(value)
      .trim()
      .replace(/,/g, '')
  );

  return isFinite(n) ? n : 0;
}

function testGetNotaTransaksi() {
  const started = Date.now();

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - TAHAP 5');
  Logger.log('TEST getNotaTransaksi()');
  Logger.log('READ-ONLY');
  Logger.log('==============================================');

  const sampleQuery =
    'SELECT kode,tanggal,pelanggan,nama_pelanggan,jumlah,bayar,angsuran,piutang ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ' +
    'ORDER BY kode LIMIT 1';

  const sampleResult = sidRetailQuery(sampleQuery);

  if (!sampleResult || sampleResult.status !== 'success') {
    throw new Error(
      'Gagal mengambil transaksi sample: ' +
      JSON.stringify(sampleResult)
    );
  }

  const rows = Array.isArray(sampleResult.data)
    ? sampleResult.data
    : [];

  if (!rows.length) {
    throw new Error('Tidak ada transaksi outstanding untuk diuji.');
  }

  const kode = String(rows[0].kode || '').trim();
  const nota = getNotaTransaksi(kode);

  const valid =
    nota &&
    nota.status === 'success' &&
    nota.header &&
    nota.header.kode_transaksi === kode &&
    Array.isArray(nota.items) &&
    nota.summary &&
    Math.abs(
      Number(nota.summary.jumlah || 0) -
      Number(rows[0].jumlah || 0)
    ) < 0.01 &&
    Math.abs(
      Number(nota.summary.piutang || 0) -
      Number(rows[0].piutang || 0)
    ) < 0.01;

  const result = {
    status: valid ? 'PASS' : 'CHECK_REQUIRED',
    read_only: true,
    duration_ms: Date.now() - started,
    kode_transaksi: kode,
    item_count: nota.items.length,
    total_item: nota.summary.total_item,
    jumlah: nota.summary.jumlah,
    bayar: nota.summary.bayar,
    angsuran: nota.summary.angsuran,
    piutang: nota.summary.piutang,
    tanggal: nota.header.tanggal,
    jatuh_tempo: nota.header.jatuh_tempo,
    pelanggan: nota.header.kode_pelanggan,
    nama_pelanggan: nota.header.nama_pelanggan,
    validation: valid
  };

  Logger.log('=== HASIL TB NUSANTARA - TAHAP 5 ===');
  Logger.log(JSON.stringify(result, null, 2));

  return result;
}

function getCustomerContact(kodePelanggan) {
  return getCustomerContactOnDemand(kodePelanggan);
}

function getCustomerContactOnDemand(kodePelanggan) {
  const kode = String(kodePelanggan || '').trim();
  if (!kode) throw new Error('Kode pelanggan kosong.');
  if (!/^[a-zA-Z0-9._\- ]+$/.test(kode)) throw new Error('Kode pelanggan tidak valid.');

  const query =
    "SELECT kode,nama,alamat,telp,saldo_piutang FROM pelanggan " +
    "WHERE kode = '" + kode.replace(/'/g, "''") + "' LIMIT 1";

  const result = sidRetailQuery(query);
  if (!result || result.status !== 'success') {
    throw new Error('Gagal mengambil kontak pelanggan: ' + JSON.stringify(result));
  }

  const row = Array.isArray(result.data) && result.data.length ? result.data[0] : {};
  return {
    kode: String(row.kode || kode),
    nama: String(row.nama || ''),
    alamat: String(row.alamat || ''),
    telp: String(row.telp || ''),
    saldo_piutang: parseMoney(row.saldo_piutang)
  };
}

function testAgingDatabase() {
  const tests = {};
  try {
    tests.test1_penjualan = sidRetailQuery(
      'SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,piutang FROM penjualan WHERE piutang > 0 LIMIT 5'
    );
  } catch (e) { tests.test1_penjualan = {status: 'exception', message: e.message}; }

  try {
    tests.test2_pelanggan = sidRetailQuery(
      'SELECT kode,nama,saldo_piutang FROM pelanggan WHERE saldo_piutang > 0 LIMIT 5'
    );
  } catch (e) { tests.test2_pelanggan = {status: 'exception', message: e.message}; }

  Logger.log(JSON.stringify(tests, null, 2));
  return tests;
}

function testAgingBatch() {
  const data = fetchOutstandingSalesInBatches();
  Logger.log('======================================');
  Logger.log('TEST BATCH SELESAI');
  Logger.log('TOTAL TRANSAKSI OUTSTANDING: ' + data.length);
  Logger.log('======================================');
  return {status: 'success', count: data.length};
}

/**
 * Diagnostic format field JT.
 * JT diuji sebagai jangka waktu hari; tidak mengubah data atau aging.
 */
function testDueDateFormat() {
  const limit = 20;
  const query =
    'SELECT kode,tanggal,jt,piutang ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ' +
    'ORDER BY kode ' +
    'LIMIT ' + limit;

  Logger.log('======================================');
  Logger.log('DIAGNOSTIC FORMAT TANGGAL JT');
  Logger.log('SAMPLE: ' + limit + ' TRANSAKSI');
  Logger.log('======================================');

  const result = sidRetailQuery(query);
  if (!result || result.status !== 'success') {
    throw new Error('Gagal mengambil sampel tanggal jatuh tempo.');
  }

  const rows = Array.isArray(result.data) ? result.data : [];

  rows.forEach(function(row, index) {
    const rawJt = row.jt;
    const parsed = parseSidDate(rawJt);

    Logger.log(
      'SAMPLE #' + (index + 1) +
      ' | KODE: ' + String(row.kode || '') +
      ' | TANGGAL: ' + String(row.tanggal || '') +
      ' | JT RAW: [' + String(rawJt == null ? '' : rawJt) + ']' +
      ' | TYPE JT: ' + (rawJt === null ? 'null' : typeof rawJt) +
      ' | JT PARSED: ' + (parsed ? formatSidDate(parsed) : 'INVALID/NULL') +
      ' | PIUTANG: ' + String(row.piutang || '')
    );
  });

  const valid = rows.filter(function(row) {
    return !!parseSidDate(row.jt);
  }).length;

  const invalid = rows.length - valid;

  Logger.log('TOTAL SAMPLE: ' + rows.length);
  Logger.log('JT VALID: ' + valid);
  Logger.log('JT INVALID/NULL: ' + invalid);

  return {
    status: 'success',
    sample_count: rows.length,
    jt_valid: valid,
    jt_invalid_or_null: invalid,
    data: rows.map(function(row) {
      const parsed = parseSidDate(row.jt);
      return {
        kode: row.kode || '',
        tanggal: row.tanggal || '',
        jt_raw: row.jt == null ? null : String(row.jt),
        jt_type: row.jt === null ? 'null' : typeof row.jt,
        jt_parsed: parsed ? formatSidDate(parsed) : null,
        piutang: parseMoney(row.piutang)
      };
    })
  };
}

function parseMoney(value) {
  if (value === null || value === undefined || value === '') return 0;
  const text = String(value).trim().replace(/,/g, '');
  const number = parseFloat(text);
  return isNaN(number) ? 0 : number;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * JT pada SID Retail adalah jangka waktu dalam hari.
 * Contoh: 7.00 berarti 7 hari setelah tanggal transaksi.
 *
 * Fungsi ini sengaja dipisahkan dari parseSidDate() agar fungsi
 * parser tanggal lama tetap aman untuk field tanggal transaksi.
 */
function parseJtDays(value) {
  if (value === null || value === undefined || value === '') return null;

  const text = String(value).trim().replace(/,/g, '');
  if (!text) return null;

  const number = Number(text);
  if (!isFinite(number) || number < 0) return null;

  // JT pada data SID berbentuk seperti 7.00.
  // Untuk aging, yang digunakan adalah jumlah hari.
  return Math.round(number);
}

/**
 * Menambahkan sejumlah hari ke tanggal tanpa mengubah objek tanggal asal.
 */
function addDays(date, days) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;

  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() + Number(days || 0));
  return result;
}

/**
 * Diagnostic hubungan:
 * tanggal transaksi + JT hari = tanggal jatuh tempo.
 *
 * Tidak mengubah data dan tidak digunakan oleh laporan produksi.
 * Mengambil sampel kecil dengan beberapa nilai JT yang tersedia.
 */
function testDueDateFromTerm() {
  const query =
    'SELECT kode,tanggal,jt,piutang,nama_pelanggan ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ' +
    'ORDER BY jt,kode ' +
    'LIMIT 100';

  Logger.log('======================================');
  Logger.log('DIAGNOSTIC JT SEBAGAI JANGKA WAKTU');
  Logger.log('======================================');

  const result = sidRetailQuery(query);

  if (!result || result.status !== 'success') {
    throw new Error(
      'Gagal mengambil sampel JT: ' + JSON.stringify(result)
    );
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  const today = startOfDay(new Date());
  const seen = {};
  const samples = [];

  rows.forEach(function(row) {
    const jtHari = parseJtDays(row.jt);
    if (jtHari === null) return;

    const jtKey = String(jtHari);
    if (seen[jtKey]) return;

    const tanggalTransaksi = parseSidDate(row.tanggal);
    if (!tanggalTransaksi) return;

    const jatuhTempo = addDays(tanggalTransaksi, jtHari);
    const umurHari = Math.floor(
      (today.getTime() - startOfDay(jatuhTempo).getTime()) / 86400000
    );

    let bucket = 'unclassified';
    if (umurHari <= 0) bucket = 'belum_jatuh_tempo';
    else if (umurHari <= 30) bucket = 'aging_1_30';
    else if (umurHari <= 60) bucket = 'aging_31_60';
    else if (umurHari <= 90) bucket = 'aging_61_90';
    else if (umurHari <= 120) bucket = 'aging_91_120';
    else bucket = 'aging_121_plus';

    seen[jtKey] = true;

    const sample = {
      kode: String(row.kode || ''),
      nama_pelanggan: String(row.nama_pelanggan || ''),
      tanggal_transaksi: formatSidDate(tanggalTransaksi),
      jt_raw: String(row.jt || ''),
      jt_hari: jtHari,
      jatuh_tempo: formatSidDate(jatuhTempo),
      umur_hari: umurHari,
      bucket: bucket,
      piutang: parseMoney(row.piutang)
    };

    samples.push(sample);

    Logger.log(
      'KODE: ' + sample.kode +
      ' | TANGGAL: ' + sample.tanggal_transaksi +
      ' | JT: ' + sample.jt_hari + ' hari' +
      ' | JATUH TEMPO: ' + sample.jatuh_tempo +
      ' | UMUR: ' + sample.umur_hari +
      ' | BUCKET: ' + sample.bucket +
      ' | PIUTANG: ' + sample.piutang
    );
  });

  Logger.log('TOTAL SAMPLE UNIK JT: ' + samples.length);
  Logger.log(JSON.stringify(samples, null, 2));

  return {
    status: 'success',
    today: formatSidDate(today),
    sample_count: samples.length,
    data: samples
  };
}

function parseSidDate(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === '0000-00-00' || text === '0000-00-00 00:00:00' || text === '.00') return null;

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
    const date = new Date(y, m - 1, d);
    return isValidDateParts(date, y, m, d) ? date : null;
  }

  match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (match) {
    const d = Number(match[1]), m = Number(match[2]), y = Number(match[3]);
    const date = new Date(y, m - 1, d);
    return isValidDateParts(date, y, m, d) ? date : null;
  }

  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function isValidDateParts(date, year, month, day) {
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function formatSidDate(value) {
  const date = value instanceof Date ? value : parseSidDate(value);
  if (!date) return '';
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function doGetLegacyHtml_() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Piutang Pelanggan - TB Nusantara')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


function testJtDistribution() {
  const query =
    'SELECT jt,COUNT(*) AS jumlah ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ' +
    'GROUP BY jt ' +
    'ORDER BY jt';

  Logger.log('======================================');
  Logger.log('DISTRIBUSI NILAI JT');
  Logger.log('======================================');

  const result = sidRetailQuery(query);

  if (!result || result.status !== 'success') {
    throw new Error(
      'Gagal mengambil distribusi JT: ' +
      JSON.stringify(result)
    );
  }

  (result.data || []).forEach(function(row) {
    Logger.log(
      'JT: [' + String(row.jt || '') + ']' +
      ' | JUMLAH: ' + String(row.jumlah || '0')
    );
  });

  return result.data || [];
}

/**
 * ============================================================
 * DIAGNOSTIC - KECEPATAN LAPORAN PIUTANG
 * ============================================================
 *
 * Fungsi ini TIDAK mengubah data.
 * Hanya mengukur:
 * 1. Total waktu laporan
 * 2. Waktu setiap batch SID Retail
 * 3. Jumlah transaksi
 * 4. Jumlah pelanggan
 * 5. Waktu proses agregasi
 *
 * Jalankan dari Apps Script:
 * testPerformancePiutang()
 */
function testPerformancePiutang() {

  const startTotal = Date.now();

  console.log('==============================================');
  console.log('DIAGNOSTIC PERFORMANCE PIUTANG');
  console.log('==============================================');

  console.log('Mulai:', new Date(startTotal).toLocaleString('id-ID'));

  try {

    // ========================================================
    // 1. TEST FETCH TRANSAKSI
    // ========================================================

    const startFetch = Date.now();

    console.log('');
    console.log('[1] Mengambil transaksi outstanding...');

    const transaksi = fetchOutstandingSalesInBatches();

    const endFetch = Date.now();
    const waktuFetch = endFetch - startFetch;

    console.log(
      '[1] Selesai:',
      formatDiagnosticDuration(waktuFetch)
    );

    console.log(
      '[1] Jumlah transaksi:',
      transaksi.length
    );


    // ========================================================
    // 2. TEST AGREGASI / AGING
    // ========================================================

    const startAggregation = Date.now();

    console.log('');
    console.log('[2] Menghitung aging dan agregasi pelanggan...');

    const customers = {};

    transaksi.forEach(function(trx) {

      const kodePelanggan =
        String(
          trx.kd_pelanggan ||
          trx.kode_pelanggan ||
          trx.pelanggan ||
          ''
        ).trim();

      const namaPelanggan =
        String(
          trx.nm_pelanggan ||
          trx.nama_pelanggan ||
          trx.nama ||
          ''
        ).trim();

      const piutang =
        Number(
          trx.piutang ||
          trx.sisa ||
          trx.outstanding ||
          0
        );

      if (!kodePelanggan || piutang <= 0) {
        return;
      }

      if (!customers[kodePelanggan]) {

        customers[kodePelanggan] = {
          kd_pelanggan: kodePelanggan,
          nm_pelanggan: namaPelanggan,
          belum_jatuh_tempo: 0,
          aging_1_30: 0,
          aging_31_60: 0,
          aging_61_90: 0,
          aging_91_120: 0,
          aging_121_plus: 0,
          total_piutang: 0
        };

      }

      customers[kodePelanggan].total_piutang += piutang;

    });

    const jumlahPelanggan =
      Object.keys(customers).length;

    const endAggregation = Date.now();
    const waktuAggregation =
      endAggregation - startAggregation;

    console.log(
      '[2] Selesai:',
      formatDiagnosticDuration(waktuAggregation)
    );

    console.log(
      '[2] Jumlah pelanggan:',
      jumlahPelanggan
    );


    // ========================================================
    // 3. TOTAL
    // ========================================================

    const endTotal = Date.now();
    const waktuTotal = endTotal - startTotal;

    console.log('');
    console.log('==============================================');
    console.log('HASIL DIAGNOSTIC');
    console.log('==============================================');

    console.log(
      'Fetch SID Retail     :',
      formatDiagnosticDuration(waktuFetch)
    );

    console.log(
      'Agregasi / Processing:',
      formatDiagnosticDuration(waktuAggregation)
    );

    console.log(
      'TOTAL                 :',
      formatDiagnosticDuration(waktuTotal)
    );

    console.log(
      'Transaksi             :',
      transaksi.length
    );

    console.log(
      'Pelanggan             :',
      jumlahPelanggan
    );

    console.log('==============================================');

    return {
      status: 'success',
      transaksi: transaksi.length,
      pelanggan: jumlahPelanggan,
      waktu_fetch_ms: waktuFetch,
      waktu_aggregation_ms: waktuAggregation,
      waktu_total_ms: waktuTotal,
      waktu_fetch: formatDiagnosticDuration(waktuFetch),
      waktu_aggregation: formatDiagnosticDuration(waktuAggregation),
      waktu_total: formatDiagnosticDuration(waktuTotal)
    };

  } catch (error) {

    const waktuTotal =
      Date.now() - startTotal;

    console.log('');
    console.log('==============================================');
    console.log('DIAGNOSTIC GAGAL');
    console.log('==============================================');

    console.log(
      'Waktu sampai error:',
      formatDiagnosticDuration(waktuTotal)
    );

    console.log(
      'ERROR:',
      error.message || error
    );

    console.log('==============================================');

    throw error;
  }
}


/**
 * Format milidetik menjadi:
 * 1.23 detik
 * atau
 * 1 menit 23.45 detik
 */
function formatDiagnosticDuration(ms) {

  if (ms < 1000) {
    return ms + ' ms';
  }

  const seconds = ms / 1000;

  if (seconds < 60) {
    return seconds.toFixed(2) + ' detik';
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return (
    minutes +
    ' menit ' +
    remainingSeconds.toFixed(2) +
    ' detik'
  );
}

/**
 * ============================================================
 * DIAGNOSTIC - TEST UKURAN BATCH SID RETAIL
 * ============================================================
 *
 * Tujuan:
 * Menguji beberapa ukuran LIMIT untuk mengetahui ukuran batch
 * yang paling efisien dan tetap stabil.
 *
 * YANG DIUJI:
 *   LIMIT 100
 *   LIMIT 150
 *   LIMIT 200
 *   LIMIT 250
 *
 * CATATAN:
 * - Tidak mengubah SID_CONFIG
 * - Tidak mengubah TRANSACTION_BATCH_SIZE
 * - Tidak mengubah fungsi produksi
 * - Tidak mengubah database
 * - Tidak melakukan INSERT / UPDATE / DELETE
 * - Hanya SELECT data outstanding
 *
 * Jalankan:
 *   testBatchLimitPerformance()
 *
 * Lihat hasilnya di:
 *   Executions / Execution log
 * ============================================================
 */
/**
 * ============================================================
 * DIAGNOSTIC BATCH PERFORMANCE - SAFE VERSION
 * ============================================================
 *
 * Tujuan:
 * - Menguji beberapa ukuran batch TANPA mengubah SID_CONFIG produksi.
 * - Menggunakan query dan parser yang sama dengan fungsi produksi.
 * - Menggunakan result.data, bukan result.result.
 * - Memastikan hasil setiap limit konsisten sebelum limit lebih besar
 *   dipertimbangkan untuk produksi.
 *
 * CATATAN:
 * Fungsi ini diagnostik saja. Tidak mengubah TRANSACTION_BATCH_SIZE.
 * ============================================================
 */
function testBatchLimitPerformance() {
  const limits = [100, 150, 200, 250];
  const results = [];

  console.log('================================');
  console.log('DIAGNOSTIC BATCH LIMIT');
  console.log('LIMIT YANG DIUJI: ' + limits.join(', '));
  console.log('CONFIG PRODUKSI TETAP: ' + SID_CONFIG.TRANSACTION_BATCH_SIZE);
  console.log('================================');

  for (let i = 0; i < limits.length; i++) {
    const result = testSingleBatchLimit(limits[i]);
    results.push(result);

    console.log(
      'LIMIT ' + limits[i] +
      ' | status=' + result.status +
      ' | transaksi=' + result.jumlah_transaksi +
      ' | batch=' + result.jumlah_batch +
      ' | waktu=' + result.waktu_total
    );
  }

  const baseline = results[0];
  const comparable = results.every(function(r) {
    return r.status === 'SUCCESS' &&
      r.jumlah_transaksi === baseline.jumlah_transaksi &&
      r.total_piutang === baseline.total_piutang &&
      r.duplicate_kode === 0;
  });

  const summary = {
    status: comparable ? 'SUCCESS' : 'WARNING',
    production_batch_size: SID_CONFIG.TRANSACTION_BATCH_SIZE,
    baseline_limit: baseline.limit,
    baseline_transactions: baseline.jumlah_transaksi,
    baseline_total_piutang: baseline.total_piutang,
    all_results_consistent: comparable,
    results: results
  };

  console.log('================================');
  console.log('HASIL VALIDASI BATCH');
  console.log('KONSISTEN: ' + comparable);
  console.log('================================');

  return summary;
}


/**
 * Menguji satu ukuran batch dengan algoritma keyset pagination
 * yang sama seperti produksi.
 */
function testSingleBatchLimit(limit) {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('LIMIT tidak valid: ' + limit);
  }

  const startTime = Date.now();
  const seenCodes = {};
  let lastKode = '';
  let totalTransaksi = 0;
  let totalPiutang = 0;
  let jumlahBatch = 0;
  let requestCount = 0;
  let duplicateKode = 0;
  const batchTimes = [];

  while (jumlahBatch < SID_CONFIG.MAX_TRANSACTION_BATCHES) {
    let query =
      'SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,piutang ' +
      'FROM penjualan ' +
      'WHERE piutang > 0 ';

    if (lastKode) {
      query += "AND kode > '" + escapeSqlString_(lastKode) + "' ";
    }

    query +=
      'ORDER BY kode ' +
      'LIMIT ' + limit;

    const batchStart = Date.now();
    let result = null;
    let lastError = null;

    for (let attempt = 0; attempt <= SID_CONFIG.RETRY_COUNT; attempt++) {
      try {
        result = sidRetailQuery(query);
        requestCount++;

        if (!result || result.status !== 'success') {
          throw new Error(
            result && result.message
              ? result.message
              : 'API mengembalikan status bukan success'
          );
        }

        break;
      } catch (err) {
        lastError = err;
        requestCount++;

        if (attempt < SID_CONFIG.RETRY_COUNT) {
          Utilities.sleep(SID_CONFIG.RETRY_DELAY_MS);
        }
      }
    }

    if (!result || result.status !== 'success') {
      return {
        limit: limit,
        status: 'ERROR',
        message: lastError ? String(lastError.message || lastError) : 'API error',
        jumlah_batch: jumlahBatch,
        jumlah_transaksi: totalTransaksi,
        total_piutang: totalPiutang,
        duplicate_kode: duplicateKode,
        request_count: requestCount,
        waktu_total_ms: Date.now() - startTime,
        waktu_total: formatDiagnosticDuration(Date.now() - startTime)
      };
    }

    const data = Array.isArray(result.data) ? result.data : [];
    const batchTime = Date.now() - batchStart;
    batchTimes.push(batchTime);
    jumlahBatch++;

    if (data.length === 0) {
      break;
    }

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const kode = String(row.kode == null ? '' : row.kode);

      if (!kode) {
        return {
          limit: limit,
          status: 'ERROR',
          message: 'Data mengandung kode kosong pada batch ' + jumlahBatch,
          jumlah_batch: jumlahBatch,
          jumlah_transaksi: totalTransaksi,
          total_piutang: totalPiutang,
          duplicate_kode: duplicateKode,
          request_count: requestCount,
          waktu_total_ms: Date.now() - startTime,
          waktu_total: formatDiagnosticDuration(Date.now() - startTime)
        };
      }

      if (seenCodes[kode]) {
        duplicateKode++;
      }
      seenCodes[kode] = true;

      totalTransaksi++;
      totalPiutang += parseMoney(row.piutang);
    }

    const nextKode = String(data[data.length - 1].kode);

    if (nextKode <= lastKode) {
      return {
        limit: limit,
        status: 'ERROR',
        message: 'Cursor tidak maju pada batch ' + jumlahBatch,
        jumlah_batch: jumlahBatch,
        jumlah_transaksi: totalTransaksi,
        total_piutang: totalPiutang,
        duplicate_kode: duplicateKode,
        request_count: requestCount,
        waktu_total_ms: Date.now() - startTime,
        waktu_total: formatDiagnosticDuration(Date.now() - startTime)
      };
    }

    lastKode = nextKode;

    if (data.length < limit) {
      break;
    }

    if (SID_CONFIG.REQUEST_DELAY_MS > 0) {
      Utilities.sleep(SID_CONFIG.REQUEST_DELAY_MS);
    }
  }

  const waktuTotal = Date.now() - startTime;
  const waktuMinimum = batchTimes.length
    ? Math.min.apply(null, batchTimes)
    : 0;
  const waktuMaksimum = batchTimes.length
    ? Math.max.apply(null, batchTimes)
    : 0;
  const waktuRataRata = batchTimes.length
    ? batchTimes.reduce(function(total, value) {
        return total + value;
      }, 0) / batchTimes.length
    : 0;

  return {
    limit: limit,
    status: 'SUCCESS',
    jumlah_batch: jumlahBatch,
    jumlah_transaksi: totalTransaksi,
    total_piutang: totalPiutang,
    duplicate_kode: duplicateKode,
    request_count: requestCount,
    waktu_total_ms: waktuTotal,
    waktu_total: formatDiagnosticDuration(waktuTotal),
    batch_min_ms: waktuMinimum,
    batch_max_ms: waktuMaksimum,
    batch_average_ms: Math.round(waktuRataRata)
  };
}


/**
 * Escape sederhana untuk nilai cursor SQL.
 */
function escapeSqlString_(value) {
  return String(value == null ? '' : value).replace(/'/g, "''");
}


/**
 * Satu formatter diagnostik saja.
 */



function testDiagnosticV2() {
  console.log('================================');
  console.log('DIAGNOSTIC V2 BERJALAN');
  console.log('WAKTU: ' + new Date());
  console.log('================================');

  return {
    status: 'success',
    message: 'Diagnostic V2 berhasil dijalankan'
  };
}

/**
 * ============================================================
 * DIAGNOSTIC - CONCURRENCY 7 (AMAN / TERPISAH DARI PRODUKSI)
 * ============================================================
 *
 * PENTING:
 * Produksi menggunakan keyset pagination:
 *   kode > cursor
 *
 * Karena cursor batch berikutnya baru diketahui setelah batch
 * sebelumnya selesai, request tidak bisa dibuat paralel begitu saja.
 *
 * Diagnostic ini menggunakan 2 tahap:
 * 1. DISCOVERY: mengambil batas batch secara sequential memakai
 *    query produksi. Tahap ini hanya untuk membuat range plan.
 * 2. PARALLEL: range yang sudah diketahui diambil dengan
 *    UrlFetchApp.fetchAll(), maksimum 7 request bersamaan.
 *
 * TIDAK MENGUBAH:
 * - SID_CONFIG
 * - TRANSACTION_BATCH_SIZE
 * - getPiutangPelangganLaporan()
 * - fetchOutstandingSalesInBatches()
 * - database
 *
 * Validasi:
 * - seluruh kode unik
 * - jumlah transaksi sama dengan discovery
 * - total piutang sama dengan discovery
 * - tidak ada range kosong secara tidak wajar
 * - HTTP/API seluruh request berhasil
 *
 * Jalankan:
 *   testConcurrency7()
 * ============================================================
 */
function testConcurrency7() {
  const BATCH_SIZE = 250;
  const CONCURRENCY = 7;
  const MAX_BATCHES = SID_CONFIG.MAX_TRANSACTION_BATCHES;

  const startAll = Date.now();

  console.log('==============================================');
  console.log('DIAGNOSTIC CONCURRENCY 7');
  console.log('==============================================');
  console.log('BATCH SIZE:', BATCH_SIZE);
  console.log('CONCURRENCY:', CONCURRENCY);
  console.log('PRODUKSI TETAP SEQUENTIAL');
  console.log('==============================================');

  // ----------------------------------------------------------
  // TAHAP 1: DISCOVERY RANGE
  // ----------------------------------------------------------
  const discoveryStart = Date.now();
  const ranges = [];
  let lastKode = '';
  let discoveryTransactions = 0;
  let discoveryTotalPiutang = 0;

  for (let batchNo = 1; batchNo <= MAX_BATCHES; batchNo++) {
    let query =
      'SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,piutang ' +
      'FROM penjualan ' +
      'WHERE piutang > 0 ';

    if (lastKode !== '') {
      query += "AND kode > '" + lastKode.replace(/'/g, "''") + "' ";
    }

    query += 'ORDER BY kode LIMIT ' + BATCH_SIZE;

    const result = sidRetailQuery(query);

    if (!result || result.status !== 'success') {
      throw new Error('Discovery batch ' + batchNo + ' gagal.');
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    if (!rows.length) break;

    const firstKode = String(rows[0].kode || '');
    const lastBatchKode = String(rows[rows.length - 1].kode || '');

    if (!firstKode || !lastBatchKode) {
      throw new Error('Discovery batch ' + batchNo + ' memiliki kode kosong.');
    }

    if (lastKode !== '' && firstKode <= lastKode) {
      throw new Error(
        'Cursor discovery tidak maju pada batch ' + batchNo +
        ': ' + firstKode + ' <= ' + lastKode
      );
    }

    let batchPiutang = 0;
    rows.forEach(function(row) {
      batchPiutang += parseMoney(row.piutang);
    });

    ranges.push({
      batch_no: batchNo,
      lower_kode: lastKode,
      upper_kode: lastBatchKode,
      expected_rows: rows.length,
      expected_piutang: batchPiutang
    });

    discoveryTransactions += rows.length;
    discoveryTotalPiutang += batchPiutang;
    lastKode = lastBatchKode;

    console.log(
      'DISCOVERY BATCH ' + batchNo +
      ' | ROWS=' + rows.length +
      ' | RANGE=' + (ranges[ranges.length - 1].lower_kode || '(awal)') +
      ' -> ' + lastBatchKode
    );

    if (rows.length < BATCH_SIZE) break;
  }

  const discoveryMs = Date.now() - discoveryStart;

  console.log('');
  console.log('DISCOVERY SELESAI');
  console.log('RANGE:', ranges.length);
  console.log('TRANSAKSI:', discoveryTransactions);
  console.log('TOTAL PIUTANG:', discoveryTotalPiutang);
  console.log('WAKTU DISCOVERY:', formatDiagnosticDuration(discoveryMs));

  // ----------------------------------------------------------
  // TAHAP 2: PARALLEL FETCH MAX 7 REQUEST
  // ----------------------------------------------------------
  const parallelStart = Date.now();
  const parallelRows = [];
  const parallelErrors = [];

  for (let offset = 0; offset < ranges.length; offset += CONCURRENCY) {
    const group = ranges.slice(offset, offset + CONCURRENCY);
    const requests = [];

    group.forEach(function(range) {
      const query = buildConcurrencyRangeQuery(
        range.lower_kode,
        range.upper_kode,
        BATCH_SIZE
      );

      const trxCode = generateTrxCode();
      const apiKey = getApiKey();
      const url =
        SID_CONFIG.BASE_URL + encodeURIComponent(apiKey) + '/' +
        encodeURIComponent(trxCode) + '/' + encodeURIComponent(query);

      requests.push({
        url: url,
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: true,
        range: range,
        trxCode: trxCode,
        query: query
      });
    });

    console.log('');
    console.log(
      'PARALLEL GROUP ' +
      (Math.floor(offset / CONCURRENCY) + 1) +
      ' | REQUEST=' + requests.length
    );

    const responseObjects = UrlFetchApp.fetchAll(
      requests.map(function(item) {
        return {
          url: item.url,
          method: item.method,
          muteHttpExceptions: item.muteHttpExceptions,
          followRedirects: item.followRedirects
        };
      })
    );

    responseObjects.forEach(function(response, index) {
      const requestInfo = requests[index];
      const httpCode = response.getResponseCode();
      const text = response.getContentText();

      let json = null;
      let error = null;

      if (!text) {
        error = 'Response kosong.';
      } else {
        try {
          json = JSON.parse(text);
        } catch (e) {
          error = 'Response bukan JSON valid.';
        }
      }

      if (!error && (httpCode < 200 || httpCode >= 300)) {
        error = 'HTTP Error ' + httpCode;
      }

      if (!error && json && json.status && String(json.status).toLowerCase() !== 'success') {
        error =
          'API status error: ' +
          String(json.result || json.message || json.error || 'unknown');
      }

      if (error) {
        parallelErrors.push({
          batch_no: requestInfo.range.batch_no,
          http_code: httpCode,
          error: error,
          trx_code: requestInfo.trxCode
        });
        return;
      }

      const rows = json && Array.isArray(json.data) ? json.data : [];

      if (rows.length !== requestInfo.range.expected_rows) {
        parallelErrors.push({
          batch_no: requestInfo.range.batch_no,
          http_code: httpCode,
          error:
            'Jumlah row berbeda. Expected=' +
            requestInfo.range.expected_rows +
            ', Actual=' + rows.length,
          trx_code: requestInfo.trxCode
        });
        return;
      }

      rows.forEach(function(row) {
        parallelRows.push({
          batch_no: requestInfo.range.batch_no,
          kode: String(row.kode || ''),
          piutang: parseMoney(row.piutang)
        });
      });

      console.log(
        'PARALLEL BATCH ' + requestInfo.range.batch_no +
        ' | HTTP=' + httpCode +
        ' | ROWS=' + rows.length
      );
    });
  }

  const parallelMs = Date.now() - parallelStart;

  // ----------------------------------------------------------
  // VALIDASI HASIL PARALLEL
  // ----------------------------------------------------------
  const kodeMap = {};
  let duplicateKode = 0;
  let emptyKode = 0;
  let parallelTotalPiutang = 0;

  parallelRows.forEach(function(row) {
    if (!row.kode) {
      emptyKode++;
      return;
    }

    if (kodeMap[row.kode]) {
      duplicateKode++;
    }

    kodeMap[row.kode] = true;
    parallelTotalPiutang += row.piutang;
  });

  const parallelTransactions = parallelRows.length;
  const uniqueKode = Object.keys(kodeMap).length;

  const transactionConsistent =
    parallelTransactions === discoveryTransactions;

  const totalPiutangConsistent =
    parallelTotalPiutang === discoveryTotalPiutang;

  const kodeConsistent =
    uniqueKode === parallelTransactions &&
    duplicateKode === 0 &&
    emptyKode === 0;

  const success =
    parallelErrors.length === 0 &&
    transactionConsistent &&
    totalPiutangConsistent &&
    kodeConsistent;

  const totalMs = Date.now() - startAll;

  console.log('');
  console.log('==============================================');
  console.log('HASIL CONCURRENCY 7');
  console.log('==============================================');
  console.log('STATUS:', success ? 'SUCCESS' : 'FAILED');
  console.log('DISCOVERY TRANSAKSI:', discoveryTransactions);
  console.log('PARALLEL TRANSAKSI:', parallelTransactions);
  console.log('DISCOVERY PIUTANG:', discoveryTotalPiutang);
  console.log('PARALLEL PIUTANG:', parallelTotalPiutang);
  console.log('UNIQUE KODE:', uniqueKode);
  console.log('DUPLIKAT KODE:', duplicateKode);
  console.log('KODE KOSONG:', emptyKode);
  console.log('ERROR REQUEST:', parallelErrors.length);
  console.log('WAKTU DISCOVERY:', formatDiagnosticDuration(discoveryMs));
  console.log('WAKTU PARALLEL:', formatDiagnosticDuration(parallelMs));
  console.log('WAKTU TOTAL TEST:', formatDiagnosticDuration(totalMs));
  console.log('TRANSAKSI KONSISTEN:', transactionConsistent);
  console.log('TOTAL PIUTANG KONSISTEN:', totalPiutangConsistent);
  console.log('KODE KONSISTEN:', kodeConsistent);
  console.log('==============================================');

  return {
    status: success ? 'success' : 'failed',
    concurrency: CONCURRENCY,
    batch_size: BATCH_SIZE,
    range_count: ranges.length,
    discovery_transactions: discoveryTransactions,
    parallel_transactions: parallelTransactions,
    discovery_total_piutang: discoveryTotalPiutang,
    parallel_total_piutang: parallelTotalPiutang,
    unique_kode: uniqueKode,
    duplicate_kode: duplicateKode,
    empty_kode: emptyKode,
    request_errors: parallelErrors,
    transaction_consistent: transactionConsistent,
    total_piutang_consistent: totalPiutangConsistent,
    kode_consistent: kodeConsistent,
    discovery_ms: discoveryMs,
    parallel_ms: parallelMs,
    total_test_ms: totalMs
  };
}

function buildConcurrencyRangeQuery(lowerKode, upperKode, limit) {
  let query =
    'SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,piutang ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ';

  if (lowerKode !== '') {
    query += "AND kode > '" + lowerKode.replace(/'/g, "''") + "' ";
  }

  query +=
    "AND kode <= '" + upperKode.replace(/'/g, "''") + "' " +
    'ORDER BY kode ' +
    'LIMIT ' + limit;

  return query;
}

/**
 * ============================================================
 * DIAGNOSTIC: AUDIT BOTTLENECK SID RETAIL REQUEST
 * Tidak mengubah fungsi produksi.
 * ============================================================
 */
function testSidRequestTiming() {

  const BATCH_SIZE = SID_CONFIG.TRANSACTION_BATCH_SIZE || 250;

  const query =
    'SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,piutang ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ' +
    'ORDER BY kode ' +
    'LIMIT ' + BATCH_SIZE;

  Logger.log('======================================');
  Logger.log('AUDIT BOTTLENECK SID RETAIL');
  Logger.log('BATCH SIZE: ' + BATCH_SIZE);
  Logger.log('======================================');

  // ----------------------------------------------------------
  // 1. Ambil API Key
  // ----------------------------------------------------------
  const t0 = Date.now();

  const apiKey = getApiKey();

  const t1 = Date.now();

  Logger.log('GET API KEY       : ' + (t1 - t0) + ' ms');

  // ----------------------------------------------------------
  // 2. Generate TRX CODE
  // ----------------------------------------------------------
  const trxCode = generateTrxCode();

  const t2 = Date.now();

  Logger.log('GENERATE TRX CODE : ' + (t2 - t1) + ' ms');

  // ----------------------------------------------------------
  // 3. Build URL
  // ----------------------------------------------------------
  const url =
    SID_CONFIG.BASE_URL +
    encodeURIComponent(apiKey) + '/' +
    encodeURIComponent(trxCode) + '/' +
    encodeURIComponent(query);

  const t3 = Date.now();

  Logger.log('BUILD URL         : ' + (t3 - t2) + ' ms');

  // ----------------------------------------------------------
  // 4. REQUEST SID RETAIL
  // ----------------------------------------------------------
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true
  });

  const t4 = Date.now();

  Logger.log('URLFETCH REQUEST   : ' + (t4 - t3) + ' ms');

  // ----------------------------------------------------------
  // 5. HTTP response
  // ----------------------------------------------------------
  const httpCode = response.getResponseCode();

  const t5 = Date.now();

  Logger.log('GET HTTP CODE      : ' + (t5 - t4) + ' ms');
  Logger.log('HTTP CODE          : ' + httpCode);

  // ----------------------------------------------------------
  // 6. Ambil response body
  // ----------------------------------------------------------
  const responseText = response.getContentText();

  const t6 = Date.now();

  Logger.log('GET CONTENT TEXT   : ' + (t6 - t5) + ' ms');
  Logger.log('RESPONSE BYTES     : ' + responseText.length);

  // ----------------------------------------------------------
  // 7. JSON PARSE
  // ----------------------------------------------------------
  let json;

  try {
    json = JSON.parse(responseText);
  } catch (e) {
    Logger.log('JSON PARSE ERROR');
    throw e;
  }

  const t7 = Date.now();

  Logger.log('JSON PARSE         : ' + (t7 - t6) + ' ms');

  // ----------------------------------------------------------
  // 8. Analisis hasil
  // ----------------------------------------------------------
  const rows = Array.isArray(json.data) ? json.data : [];

  const t8 = Date.now();

  Logger.log('ANALISIS DATA      : ' + (t8 - t7) + ' ms');
  Logger.log('API STATUS         : ' + (json.status || '(none)'));
  Logger.log('ROWS               : ' + rows.length);

  // ----------------------------------------------------------
  // 9. TOTAL
  // ----------------------------------------------------------
  Logger.log('--------------------------------------');
  Logger.log('TOTAL               : ' + (t8 - t0) + ' ms');
  Logger.log('TOTAL               : ' + ((t8 - t0) / 1000).toFixed(3) + ' detik');
  Logger.log('======================================');

  return {
    status: 'success',
    batch_size: BATCH_SIZE,
    http_code: httpCode,
    api_status: json.status || null,
    rows: rows.length,

    timing_ms: {
      get_api_key: t1 - t0,
      generate_trx_code: t2 - t1,
      build_url: t3 - t2,
      urlfetch: t4 - t3,
      get_http_code: t5 - t4,
      get_content_text: t6 - t5,
      json_parse: t7 - t6,
      analyze_data: t8 - t7,
      total: t8 - t0
    },

    response_bytes: responseText.length
  };
}

/**
 * ============================================================
 * DIAGNOSTIC: SID RETAIL LIMIT 300
 * Hanya mengukur 1 request dengan LIMIT 300.
 * Tidak mengubah konfigurasi produksi.
 * ============================================================
 */
function testBatch300FetchTiming() {

  const LIMIT = 300;

  const query =
    'SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,piutang ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ' +
    'ORDER BY kode ' +
    'LIMIT ' + LIMIT;

  Logger.log('======================================');
  Logger.log('SID RETAIL FETCH TEST');
  Logger.log('LIMIT: ' + LIMIT);
  Logger.log('======================================');

  const t0 = Date.now();

  const apiKey = getApiKey();

  const t1 = Date.now();

  const trxCode = generateTrxCode();

  const t2 = Date.now();

  const url =
    SID_CONFIG.BASE_URL +
    encodeURIComponent(apiKey) + '/' +
    encodeURIComponent(trxCode) + '/' +
    encodeURIComponent(query);

  const t3 = Date.now();

  Logger.log('GET API KEY       : ' + (t1 - t0) + ' ms');
  Logger.log('GENERATE TRX CODE : ' + (t2 - t1) + ' ms');
  Logger.log('BUILD URL         : ' + (t3 - t2) + ' ms');

  // REQUEST SID RETAIL
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true
  });

  const t4 = Date.now();

  const httpCode = response.getResponseCode();

  const t5 = Date.now();

  const responseText = response.getContentText();

  const t6 = Date.now();

  let json;

  try {
    json = JSON.parse(responseText);
  } catch (e) {
    Logger.log('JSON PARSE ERROR');
    throw e;
  }

  const t7 = Date.now();

  const rows = Array.isArray(json.data) ? json.data : [];

  const t8 = Date.now();

  Logger.log('--------------------------------------');
  Logger.log('URLFETCH REQUEST   : ' + (t4 - t3) + ' ms');
  Logger.log('GET HTTP CODE      : ' + (t5 - t4) + ' ms');
  Logger.log('GET CONTENT TEXT   : ' + (t6 - t5) + ' ms');
  Logger.log('JSON PARSE         : ' + (t7 - t6) + ' ms');
  Logger.log('ANALISIS DATA      : ' + (t8 - t7) + ' ms');
  Logger.log('--------------------------------------');

  Logger.log('HTTP CODE          : ' + httpCode);
  Logger.log('API STATUS         : ' + (json.status || '(none)'));
  Logger.log('ROWS               : ' + rows.length);
  Logger.log('RESPONSE BYTES     : ' + responseText.length);

  Logger.log('--------------------------------------');
  Logger.log(
    'TOTAL              : ' +
    (t8 - t0) +
    ' ms (' +
    ((t8 - t0) / 1000).toFixed(3) +
    ' detik)'
  );

  Logger.log('======================================');

  return {
    status: httpCode === 200 && json.status === 'success'
      ? 'success'
      : 'error',

    limit: LIMIT,
    http_code: httpCode,
    api_status: json.status || null,
    rows: rows.length,
    response_bytes: responseText.length,

    timing_ms: {
      get_api_key: t1 - t0,
      generate_trx_code: t2 - t1,
      build_url: t3 - t2,
      urlfetch: t4 - t3,
      get_http_code: t5 - t4,
      get_content_text: t6 - t5,
      json_parse: t7 - t6,
      analyze_data: t8 - t7,
      total: t8 - t0
    }
  };
}


/**
 * ============================================================
 * DIAGNOSTIC: FULL BATCH 300
 * ============================================================
 *
 * Tujuan:
 * - Mengambil seluruh transaksi outstanding dengan LIMIT 300
 * - Menguji keyset pagination
 * - Membandingkan jumlah transaksi
 * - Menghitung total piutang
 * - Memeriksa kode kosong
 * - Memeriksa duplicate kode
 * - Memastikan cursor selalu bergerak
 *
 * TIDAK mengubah SID_CONFIG production.
 * ============================================================
 */
function testFullBatch300() {

  const TEST_BATCH_SIZE = 300;
  const MAX_BATCHES = SID_CONFIG.MAX_TRANSACTION_BATCHES;

  const all = [];

  let lastKode = '';
  let batchCount = 0;

  let totalPiutang = 0;
  let totalRows = 0;

  const duplicateMap = {};
  const emptyKodeRows = [];

  const startedAt = Date.now();

  Logger.log('======================================');
  Logger.log('FULL BATCH 300 TEST');
  Logger.log('======================================');
  Logger.log('TEST BATCH SIZE : ' + TEST_BATCH_SIZE);
  Logger.log('MAX BATCHES     : ' + MAX_BATCHES);
  Logger.log('======================================');

  for (let batchNo = 1; batchNo <= MAX_BATCHES; batchNo++) {

    let query =
      'SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,piutang ' +
      'FROM penjualan ' +
      'WHERE piutang > 0 ';

    if (lastKode !== '') {
      query +=
        "AND kode > '" +
        lastKode.replace(/'/g, "''") +
        "' ";
    }

    query +=
      'ORDER BY kode ' +
      'LIMIT ' +
      TEST_BATCH_SIZE;

    Logger.log(
      '--------------------------------------'
    );

    Logger.log(
      'BATCH ' +
      batchNo +
      ' | CURSOR: ' +
      (lastKode || '(awal)')
    );

    const requestStarted = Date.now();

    let result = null;
    let lastError = null;

    for (
      let attempt = 1;
      attempt <= SID_CONFIG.RETRY_COUNT + 1;
      attempt++
    ) {

      try {

        result = sidRetailQuery(query);

        lastError = null;

        break;

      } catch (error) {

        lastError = error;

        Logger.log(
          'ATTEMPT ' +
          attempt +
          ' ERROR: ' +
          (error && error.message
            ? error.message
            : String(error))
        );

        if (attempt <= SID_CONFIG.RETRY_COUNT) {

          Utilities.sleep(
            SID_CONFIG.RETRY_DELAY_MS
          );

        }
      }
    }

    const requestFinished = Date.now();

    if (lastError) {

      throw new Error(
        'Batch #' +
        batchNo +
        ' gagal setelah ' +
        (SID_CONFIG.RETRY_COUNT + 1) +
        ' percobaan: ' +
        (lastError.message || lastError)
      );

    }

    if (!result || result.status !== 'success') {

      throw new Error(
        'Batch #' +
        batchNo +
        ' mengembalikan status tidak valid: ' +
        JSON.stringify(result)
      );

    }

    const rows =
      Array.isArray(result.data)
        ? result.data
        : [];

    Logger.log(
      'ROWS       : ' +
      rows.length
    );

    Logger.log(
      'REQUEST    : ' +
      ((requestFinished - requestStarted) / 1000)
        .toFixed(3) +
      ' detik'
    );

    if (rows.length === 0) {

      Logger.log(
        'BATCH KOSONG - SELESAI'
      );

      break;

    }

    // --------------------------------------------------------
    // VALIDASI ROW
    // --------------------------------------------------------

    rows.forEach(function(row) {

      const kode =
        String(row.kode || '').trim();

      const piutang =
        Number(row.piutang || 0);

      totalRows++;

      totalPiutang += piutang;

      if (!kode) {

        emptyKodeRows.push(row);

      } else {

        duplicateMap[kode] =
          (duplicateMap[kode] || 0) + 1;

      }

      all.push(row);

    });

    // --------------------------------------------------------
    // CURSOR
    // --------------------------------------------------------

    const newLastKode =
      String(
        rows[rows.length - 1].kode || ''
      ).trim();

    if (!newLastKode) {

      throw new Error(
        'Batch #' +
        batchNo +
        ' tidak mempunyai kode pada row terakhir.'
      );

    }

    if (
      lastKode !== '' &&
      newLastKode <= lastKode
    ) {

      throw new Error(
        'CURSOR TIDAK BERGERAK pada batch #' +
        batchNo +
        '\n' +
        'Sebelumnya: ' +
        lastKode +
        '\n' +
        'Sekarang: ' +
        newLastKode
      );

    }

    lastKode = newLastKode;

    batchCount++;

    Logger.log(
      'LAST KODE  : ' +
      lastKode
    );

    Logger.log(
      'TOTAL ROW  : ' +
      totalRows
    );

    Logger.log(
      'TOTAL PIUTANG SEMENTARA: Rp ' +
      totalPiutang.toLocaleString('id-ID')
    );

    // --------------------------------------------------------
    // BATCH TERAKHIR
    // --------------------------------------------------------

    if (rows.length < TEST_BATCH_SIZE) {

      Logger.log(
        'BATCH TERAKHIR TERDETEKSI'
      );

      break;

    }

  }

  // ==========================================================
  // VALIDASI AKHIR
  // ==========================================================

  const uniqueKode =
    Object.keys(duplicateMap).length;

  const duplicateKode =
    Object.keys(duplicateMap)
      .filter(function(kode) {
        return duplicateMap[kode] > 1;
      });

  const finishedAt = Date.now();

  const durationMs =
    finishedAt - startedAt;

  Logger.log('');
  Logger.log('======================================');
  Logger.log('HASIL FULL BATCH 300');
  Logger.log('======================================');

  Logger.log(
    'STATUS              : SUCCESS'
  );

  Logger.log(
    'JUMLAH BATCH        : ' +
    batchCount
  );

  Logger.log(
    'TOTAL TRANSAKSI     : ' +
    totalRows
  );

  Logger.log(
    'UNIQUE KODE         : ' +
    uniqueKode
  );

  Logger.log(
    'DUPLICATE KODE      : ' +
    duplicateKode.length
  );

  Logger.log(
    'KODE KOSONG         : ' +
    emptyKodeRows.length
  );

  Logger.log(
    'TOTAL PIUTANG       : Rp ' +
    totalPiutang.toLocaleString('id-ID')
  );

  Logger.log(
    'LAST KODE           : ' +
    lastKode
  );

  Logger.log(
    'DURASI TOTAL        : ' +
    (durationMs / 1000).toFixed(3) +
    ' detik'
  );

  Logger.log('======================================');

  // ==========================================================
  // VALIDASI
  // ==========================================================

  const validation =
    duplicateKode.length === 0 &&
    emptyKodeRows.length === 0 &&
    totalRows > 0;

  Logger.log(
    'VALIDASI DATA       : ' +
    (validation ? 'TRUE' : 'FALSE')
  );

  Logger.log('======================================');

  if (!validation) {

    throw new Error(
      'VALIDASI BATCH 300 GAGAL. ' +
      'Duplicate=' +
      duplicateKode.length +
      ', Kode kosong=' +
      emptyKodeRows.length
    );

  }

  return {

    status: 'success',

    batch_size: TEST_BATCH_SIZE,

    batches: batchCount,

    transactions: totalRows,

    unique_kode: uniqueKode,

    duplicate_kode: duplicateKode.length,

    empty_kode: emptyKodeRows.length,

    total_piutang: totalPiutang,

    last_kode: lastKode,

    duration_ms: durationMs,

    duration_seconds:
      Number(
        (durationMs / 1000).toFixed(3)
      ),

    validation: validation

  };
}

/**
 * TAHAP 6A - DATA PDF PIUTANG
 * ============================================================
 *
 * Read-only.
 * Tidak mengubah fungsi aging / batch produksi.
 *
 * FUNGSI:
 * 1. getRingkasanPiutangPelanggan(kodePelanggan)
 *    -> daftar invoice outstanding + total outstanding.
 *
 * 2. getSemuaNotaOutstanding(kodePelanggan)
 *    -> mengambil seluruh nota outstanding beserta itemnya.
 *       Nantinya dipakai untuk PDF A4 multi-page.
 *
 * Catatan:
 * PDF belum dibuat pada tahap ini.
 * Tahap ini khusus membuktikan struktur data PDF.
 * ============================================================
 */

function validateStage6CustomerCode_(kodePelanggan) {
  const kode = String(kodePelanggan || '').trim();

  if (!kode) {
    throw new Error('Kode pelanggan kosong.');
  }

  if (!/^[a-zA-Z0-9._\- ]+$/.test(kode)) {
    throw new Error('Kode pelanggan tidak valid.');
  }

  return kode;
}


function validateStage6TransactionCode_(kodeTransaksi) {
  const kode = String(kodeTransaksi || '').trim();

  if (!kode) {
    throw new Error('Kode transaksi kosong.');
  }

  if (!/^[a-zA-Z0-9._\- ]+$/.test(kode)) {
    throw new Error('Kode transaksi tidak valid.');
  }

  return kode;
}


/**
 * Mengambil ringkasan seluruh invoice outstanding milik satu pelanggan.
 *
 * Output utama:
 * - data[]       : daftar invoice
 * - total_invoice: jumlah seluruh nilai piutang outstanding
 *
 * total_invoice di sini sengaja berarti TOTAL SALDO INVOICE OUTSTANDING,
 * bukan SUM penjualan.jumlah. Nilainya = SUM(piutang).
 */
function getRingkasanPiutangPelanggan(kodePelanggan) {
  const kode = validateStage6CustomerCode_(kodePelanggan);
  const started = Date.now();
  const escapedKode = kode.replace(/'/g, "''");

  const query =
    'SELECT kode,tanggal,pelanggan,nama_pelanggan,jt,piutang ' +
    'FROM penjualan ' +
    "WHERE pelanggan = '" + escapedKode + "' " +
    'AND piutang > 0 ' +
    'ORDER BY kode ' +
    'LIMIT ' + SID_CONFIG.DETAIL_LIMIT;

  const result = sidRetailQuery(query);

  if (!result || result.status !== 'success') {
    throw new Error(
      'Gagal mengambil ringkasan piutang pelanggan: ' +
      JSON.stringify(result)
    );
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  const today = startOfDay(new Date());

  const data = rows.map(function(row, index) {
    const kodeTransaksi = String(row.kode || '').trim();

    if (!kodeTransaksi) {
      throw new Error(
        'Invoice #' + (index + 1) + ' tidak memiliki kode transaksi.'
      );
    }

    const tanggalTransaksi = parseSidDate(row.tanggal);
    const jtHari = parseJtDays(row.jt);
    const jatuhTempo = (
      tanggalTransaksi && jtHari !== null
    ) ? addDays(tanggalTransaksi, jtHari) : null;

    const umurHari = jatuhTempo
      ? Math.floor(
          (today.getTime() - startOfDay(jatuhTempo).getTime()) / 86400000
        )
      : null;

    return {
      no: index + 1,
      kode_transaksi: kodeTransaksi,
      tanggal: row.tanggal || '',
      kode_pelanggan: row.pelanggan || kode,
      nama_pelanggan: row.nama_pelanggan || '',
      jt_hari: jtHari,
      jatuh_tempo: formatSidDate(jatuhTempo),
      umur_hari: umurHari,
      umur_label: stage6AgeLabel_(umurHari),
      piutang: parseMoney(row.piutang)
    };
  });

  let totalInvoice = 0;
  data.forEach(function(item) {
    totalInvoice += item.piutang;
  });

  let contact = {
    nama: data.length ? data[0].nama_pelanggan : '',
    telp: '',
    alamat: ''
  };

  try {
    contact = getCustomerContactOnDemand(kode) || contact;
  } catch (contactError) {
    Logger.log(
      'STAGE 6 CONTACT GAGAL | KODE=' + kode +
      ' | ERROR=' +
      (contactError && contactError.message
        ? contactError.message
        : String(contactError))
    );
  }

  return {
    status: 'success',
    generated_at: new Date().toISOString(),
    today: formatSidDate(today),
    kode_pelanggan: kode,
    nama_pelanggan: contact.nama || (data[0] && data[0].nama_pelanggan) || kode,
    telp: contact.telp || '',
    alamat: contact.alamat || '',
    count: data.length,
    total_invoice: totalInvoice,
    total_outstanding: totalInvoice,
    data: data,
    duration_ms: Date.now() - started
  };
}


function stage6AgeLabel_(umurHari) {
  if (umurHari === null || umurHari === undefined || !isFinite(Number(umurHari))) {
    return '-';
  }

  const umur = Number(umurHari);

  if (umur <= 0) return 'Belum JT';
  return umur + ' hari';
}


/**
 * Mengambil semua nota outstanding pelanggan beserta detail barang.
 *
 * Ini belum membuat PDF.
 * Hasilnya merupakan satu struktur data yang siap dirender menjadi
 * satu PDF A4 multi-page pada tahap berikutnya.
 */
function getSemuaNotaOutstanding(kodePelanggan) {
  const kode = validateStage6CustomerCode_(kodePelanggan);
  const started = Date.now();

  const ringkasan = getRingkasanPiutangPelanggan(kode);
  const invoices = [];

  ringkasan.data.forEach(function(row, index) {
    const kodeTransaksi = validateStage6TransactionCode_(row.kode_transaksi);

    Logger.log(
      'STAGE 6 DETAIL ' + (index + 1) + '/' +
      ringkasan.data.length +
      ' | KODE=' + kodeTransaksi
    );

    const nota = getNotaTransaksi(kodeTransaksi);

    if (!nota || nota.status !== 'success') {
      throw new Error(
        'Gagal mengambil nota outstanding: ' + kodeTransaksi
      );
    }

    // Pastikan nota yang diambil memang masih outstanding.
    if (!nota.summary || Number(nota.summary.piutang) <= 0) {
      throw new Error(
        'Invoice ' + kodeTransaksi +
        ' tidak lagi memiliki saldo piutang outstanding.'
      );
    }

    invoices.push(nota);
  });

  let totalOutstanding = 0;
  invoices.forEach(function(nota) {
    totalOutstanding += Number(nota.summary.piutang || 0);
  });

  // Validasi silang dengan ringkasan.
  const selisih = totalOutstanding - Number(ringkasan.total_outstanding || 0);

  if (Math.abs(selisih) > 0.01) {
    throw new Error(
      'Validasi total outstanding Stage 6 gagal. ' +
      'Ringkasan=' + ringkasan.total_outstanding +
      ', detail=' + totalOutstanding
    );
  }

  return {
    status: 'success',
    generated_at: new Date().toISOString(),
    kode_pelanggan: kode,
    nama_pelanggan: ringkasan.nama_pelanggan,
    telp: ringkasan.telp,
    alamat: ringkasan.alamat,
    count: invoices.length,
    total_outstanding: totalOutstanding,
    ringkasan: ringkasan.data,
    invoices: invoices,
    duration_ms: Date.now() - started
  };
}

/**
 * ============================================================
 * TAHAP 6A - TEST DATA PDF PIUTANG
 * ============================================================
 * READ-ONLY.
 *
 * Memastikan:
 * 1. Ringkasan pelanggan dapat diambil.
 * 2. Invoice outstanding sample masuk ke ringkasan.
 * 3. Nilai piutang ringkasan sama dengan getNotaTransaksi().
 * ============================================================
 */
function testStage6A() {
  const started = Date.now();

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - TAHAP 6A');
  Logger.log('TEST DATA PDF PIUTANG');
  Logger.log('READ-ONLY');
  Logger.log('==============================================');

  const sampleQuery =
    'SELECT kode,tanggal,pelanggan,nama_pelanggan,jumlah,bayar,angsuran,piutang ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ' +
    'ORDER BY kode LIMIT 1';

  const sampleResult = sidRetailQuery(sampleQuery);

  if (!sampleResult || sampleResult.status !== 'success') {
    throw new Error(
      'Gagal mengambil transaksi sample: ' +
      JSON.stringify(sampleResult)
    );
  }

  const rows = Array.isArray(sampleResult.data)
    ? sampleResult.data
    : [];

  if (!rows.length) {
    throw new Error('Tidak ada transaksi outstanding untuk diuji.');
  }

  const sample = rows[0];
  const kodePelanggan = String(sample.pelanggan || '').trim();
  const kodeTransaksi = String(sample.kode || '').trim();

  if (!kodePelanggan) {
    throw new Error('Sample tidak memiliki kode pelanggan.');
  }

  if (!kodeTransaksi) {
    throw new Error('Sample tidak memiliki kode transaksi.');
  }

  Logger.log(
    'SAMPLE PELANGGAN: ' + kodePelanggan +
    ' | TRANSAKSI: ' + kodeTransaksi
  );

  const ringkasan = getRingkasanPiutangPelanggan(kodePelanggan);

  if (!ringkasan || ringkasan.status !== 'success') {
    throw new Error(
      'getRingkasanPiutangPelanggan() gagal: ' +
      JSON.stringify(ringkasan)
    );
  }

  const sampleInvoice = ringkasan.data.find(function(item) {
    return String(item.kode_transaksi || '') === kodeTransaksi;
  });

  if (!sampleInvoice) {
    throw new Error(
      'Invoice sample ' + kodeTransaksi +
      ' tidak ditemukan dalam ringkasan pelanggan ' + kodePelanggan + '.'
    );
  }

  const nota = getNotaTransaksi(kodeTransaksi);

  if (!nota || nota.status !== 'success') {
    throw new Error(
      'getNotaTransaksi() gagal untuk ' + kodeTransaksi
    );
  }

  const ringkasanPiutang = Number(sampleInvoice.piutang || 0);
  const notaPiutang = Number(
    nota.summary && nota.summary.piutang
      ? nota.summary.piutang
      : 0
  );

  const selisih = Math.abs(ringkasanPiutang - notaPiutang);

  const valid =
    ringkasan.kode_pelanggan === kodePelanggan &&
    sampleInvoice.kode_transaksi === kodeTransaksi &&
    selisih <= 0.01 &&
    Number(ringkasan.total_outstanding || 0) > 0;

  const result = {
    status: valid ? 'PASS' : 'CHECK_REQUIRED',
    read_only: true,
    duration_ms: Date.now() - started,
    kode_pelanggan: kodePelanggan,
    nama_pelanggan: ringkasan.nama_pelanggan,
    kode_transaksi: kodeTransaksi,
    invoice_count: ringkasan.count,
    total_outstanding: ringkasan.total_outstanding,
    sample_piutang_ringkasan: ringkasanPiutang,
    sample_piutang_nota: notaPiutang,
    selisih: selisih,
    validation: valid
  };

  Logger.log('=== HASIL TB NUSANTARA - TAHAP 6A ===');
  Logger.log(JSON.stringify(result, null, 2));

  return result;
}


/**
 * ============================================================
 * TAHAP 6B - PDF RINGKASAN PIUTANG PELANGGAN
 * ============================================================
 *
 * READ-ONLY.
 *
 * Fungsi:
 * 1. getPdfRingkasanPiutangPelanggan(kodePelanggan)
 *    -> menghasilkan PDF A4 ringkasan piutang satu pelanggan.
 *
 * 2. testStage6B()
 *    -> mengambil sample pelanggan outstanding, membuat PDF,
 *       lalu memvalidasi struktur hasil PDF.
 *
 * Catatan:
 * - Tidak mengubah fungsi Stage 6A.
 * - Tidak mengambil detail itempenjualan.
 * - Total outstanding = SUM(piutang).
 * - Nomor telepon pelanggan tidak dijadikan recipient WhatsApp.
 * ============================================================
 */

function stage6bEscapeHtml_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function stage6bFormatRupiah_(value) {
  const number = Number(value || 0);

  return 'Rp' + number.toLocaleString('id-ID');
}


function stage6bFormatDate_(value) {
  if (!value) return '';

  const date = parseSidDate(value);

  if (!date) {
    return String(value);
  }

  return String(date.getDate()).padStart(2, '0') + '/' +
    String(date.getMonth() + 1).padStart(2, '0') + '/' +
    date.getFullYear();
}


function stage6bFormatAge_(item) {
  if (!item) return '-';

  if (
    item.umur_hari === null ||
    item.umur_hari === undefined ||
    !isFinite(Number(item.umur_hari))
  ) {
    return '-';
  }

  const umur = Number(item.umur_hari);

  if (umur <= 0) {
    return 'Belum JT';
  }

  return umur + ' hari';
}


function buildRingkasanPiutangPdfHtml_(ringkasan) {
  if (!ringkasan || ringkasan.status !== 'success') {
    throw new Error('Data ringkasan PDF tidak valid.');
  }

  const rows = Array.isArray(ringkasan.data)
    ? ringkasan.data
    : [];

  let tableRows = '';

  rows.forEach(function(item) {
    tableRows +=
      '<tr>' +
        '<td class="center">' +
          stage6bEscapeHtml_(item.kode_transaksi) +
        '</td>' +
        '<td class="center">' +
          stage6bFormatDate_(item.tanggal) +
        '</td>' +
        '<td class="center">' +
          stage6bFormatDate_(item.jatuh_tempo) +
        '</td>' +
        '<td class="center">' +
          stage6bEscapeHtml_(stage6bFormatAge_(item)) +
        '</td>' +
        '<td class="money">' +
          stage6bEscapeHtml_(stage6bFormatRupiah_(item.piutang)) +
        '</td>' +
      '</tr>';
  });

  if (!tableRows) {
    tableRows =
      '<tr>' +
        '<td colspan="5" class="empty">' +
          'Tidak ada piutang outstanding.' +
        '</td>' +
      '</tr>';
  }

  const generatedDate = ringkasan.today ||
    formatSidDate(new Date());

  const namaPelanggan =
    ringkasan.nama_pelanggan ||
    (rows[0] && rows[0].nama_pelanggan) ||
    '';

  return '<!DOCTYPE html>' +
  '<html>' +
  '<head>' +
    '<meta charset="UTF-8">' +
    '<style>' +
      '@page {' +
        'size: A4 portrait;' +
        'margin: 15mm 13mm 14mm 13mm;' +
      '}' +

      'html, body {' +
        'margin: 0;' +
        'padding: 0;' +
        'font-family: Arial, Helvetica, sans-serif;' +
        'font-size: 10pt;' +
        'color: #111827;' +
        'background: #ffffff;' +
      '}' +

      'body {' +
        'width: 100%;' +
      '}' +

      '.header {' +
        'border-bottom: 2px solid #111827;' +
        'padding-bottom: 7px;' +
        'margin-bottom: 13px;' +
      '}' +

      '.company {' +
        'font-size: 15pt;' +
        'font-weight: 700;' +
        'letter-spacing: .2px;' +
      '}' +

      '.legal {' +
        'font-size: 9.5pt;' +
        'font-weight: 700;' +
        'margin-top: 2px;' +
      '}' +

      '.company-detail {' +
        'font-size: 8.5pt;' +
        'margin-top: 3px;' +
        'line-height: 1.35;' +
      '}' +

      '.title {' +
        'text-align: center;' +
        'font-size: 13pt;' +
        'font-weight: 700;' +
        'margin: 13px 0 12px 0;' +
        'letter-spacing: .3px;' +
      '}' +

      '.customer {' +
        'width: 100%;' +
        'border-collapse: collapse;' +
        'margin-bottom: 12px;' +
        'font-size: 9pt;' +
      '}' +

      '.customer td {' +
        'padding: 2px 0;' +
        'vertical-align: top;' +
      '}' +

      '.customer .label {' +
        'width: 18mm;' +
        'font-weight: 700;' +
      '}' +

      '.customer .sep {' +
        'width: 4mm;' +
        'text-align: center;' +
      '}' +

      '.table {' +
        'width: 100%;' +
        'border-collapse: collapse;' +
        'table-layout: fixed;' +
        'font-size: 8.5pt;' +
      '}' +

      '.table th {' +
        'background: #111827;' +
        'color: #ffffff;' +
        'font-weight: 700;' +
        'padding: 6px 4px;' +
        'border: 1px solid #111827;' +
        'text-align: center;' +
      '}' +

      '.table td {' +
        'padding: 5px 4px;' +
        'border: 1px solid #9ca3af;' +
        'vertical-align: middle;' +
      '}' +

      '.table th:nth-child(1), .table td:nth-child(1) {' +
        'width: 28%;' +
      '}' +

      '.table th:nth-child(2), .table td:nth-child(2) {' +
        'width: 16%;' +
      '}' +

      '.table th:nth-child(3), .table td:nth-child(3) {' +
        'width: 17%;' +
      '}' +

      '.table th:nth-child(4), .table td:nth-child(4) {' +
        'width: 15%;' +
      '}' +

      '.table th:nth-child(5), .table td:nth-child(5) {' +
        'width: 24%;' +
      '}' +

      '.center {' +
        'text-align: center;' +
      '}' +

      '.money {' +
        'text-align: right;' +
        'white-space: nowrap;' +
      '}' +

      '.empty {' +
        'text-align: center;' +
        'padding: 12px;' +
      '}' +

      '.total {' +
        'width: 100%;' +
        'border-collapse: collapse;' +
        'margin-top: 8px;' +
      '}' +

      '.total td {' +
        'border: 1px solid #111827;' +
        'padding: 7px 6px;' +
        'font-weight: 700;' +
      '}' +

      '.total-label {' +
        'text-align: right;' +
      '}' +

      '.total-value {' +
        'text-align: right;' +
        'font-size: 11pt;' +
        'white-space: nowrap;' +
      '}' +

      '.footer {' +
        'margin-top: 13px;' +
        'font-size: 7.5pt;' +
        'color: #6b7280;' +
        'text-align: right;' +
      '}' +

      'thead {' +
        'display: table-header-group;' +
      '}' +

      'tr {' +
        'page-break-inside: avoid;' +
      '}' +
    '</style>' +
  '</head>' +

  '<body>' +

    '<div class="header">' +
      '<div class="company">TB NUSANTARA</div>' +
      '<div class="legal">CV NUSANTARA BUILDING MATERIAL</div>' +
      '<div class="company-detail">' +
        'JL. LINTAS SELATAN SUROREJAN PURING<br>' +
        '081234563843' +
      '</div>' +
    '</div>' +

    '<div class="title">RINGKASAN PIUTANG PELANGGAN</div>' +

    '<table class="customer">' +
      '<tr>' +
        '<td class="label">Pelanggan</td>' +
        '<td class="sep">:</td>' +
        '<td>' + stage6bEscapeHtml_(namaPelanggan) + '</td>' +
      '</tr>' +
      '<tr>' +
        '<td class="label">Alamat</td>' +
        '<td class="sep">:</td>' +
        '<td>' + stage6bEscapeHtml_(ringkasan.alamat || '') + '</td>' +
      '</tr>' +
      '<tr>' +
        '<td class="label">Kode</td>' +
        '<td class="sep">:</td>' +
        '<td>' + stage6bEscapeHtml_(ringkasan.kode_pelanggan) + '</td>' +
      '</tr>' +
      '<tr>' +
        '<td class="label">Tanggal</td>' +
        '<td class="sep">:</td>' +
        '<td>' + stage6bEscapeHtml_(stage6bFormatDate_(generatedDate)) + '</td>' +
      '</tr>' +
    '</table>' +

    '<table class="table">' +
      '<thead>' +
        '<tr>' +
          '<th>Kode Nota</th>' +
          '<th>Tanggal</th>' +
          '<th>Jatuh Tempo</th>' +
          '<th>Umur</th>' +
          '<th>Piutang</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        tableRows +
      '</tbody>' +
    '</table>' +

    '<table class="total">' +
      '<tr>' +
        '<td class="total-label">TOTAL OUTSTANDING</td>' +
        '<td class="total-value">' +
          stage6bEscapeHtml_(
            stage6bFormatRupiah_(ringkasan.total_outstanding)
          ) +
        '</td>' +
      '</tr>' +
    '</table>' +

    '<div class="footer">' +
      'Dokumen ringkasan piutang — TB Nusantara' +
    '</div>' +

  '</body>' +
  '</html>';
}


/**
 * Menghasilkan PDF A4 ringkasan piutang satu pelanggan.
 *
 * Return:
 * {
 *   status,
 *   filename,
 *   mime_type,
 *   size_bytes,
 *   kode_pelanggan,
 *   total_outstanding,
 *   invoice_count,
 *   pdf_base64
 * }
 *
 * Base64 dipakai agar hasil dapat dikirim ke frontend
 * melalui google.script.run tanpa membuat file Drive.
 */
function getPdfRingkasanPiutangPelanggan(kodePelanggan) {
  const kode = validateStage6CustomerCode_(kodePelanggan);
  const started = Date.now();

  const ringkasan = getRingkasanPiutangPelanggan(kode);

  if (!ringkasan || ringkasan.status !== 'success') {
    throw new Error('Gagal mengambil data ringkasan PDF.');
  }

  const html = buildRingkasanPiutangPdfHtml_(ringkasan);

  const htmlOutput = HtmlService
    .createHtmlOutput(html)
    .setWidth(794)
    .setHeight(1123);

  const pdfBlob = htmlOutput
    .getBlob()
    .getAs(MimeType.PDF);

  const bytes = pdfBlob.getBytes();

  if (!bytes || !bytes.length) {
    throw new Error('PDF ringkasan gagal dibuat: ukuran PDF 0 byte.');
  }

  const safeCustomerCode =
    String(ringkasan.kode_pelanggan || kode)
      .replace(/[^a-zA-Z0-9._-]+/g, '_');

  const filename =
    'Ringkasan_Piutang_' + safeCustomerCode + '.pdf';

  pdfBlob.setName(filename);

  const result = {
    status: 'success',
    filename: filename,
    mime_type: pdfBlob.getContentType(),
    size_bytes: bytes.length,
    kode_pelanggan: ringkasan.kode_pelanggan,
    nama_pelanggan: ringkasan.nama_pelanggan,
    invoice_count: ringkasan.count,
    total_outstanding: ringkasan.total_outstanding,
    pdf_base64: Utilities.base64Encode(bytes),
    duration_ms: Date.now() - started
  };

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - TAHAP 6B');
  Logger.log('PDF RINGKASAN PIUTANG');
  Logger.log('==============================================');
  Logger.log(
    'PELANGGAN        : ' + result.nama_pelanggan
  );
  Logger.log(
    'KODE             : ' + result.kode_pelanggan
  );
  Logger.log(
    'JUMLAH INVOICE   : ' + result.invoice_count
  );
  Logger.log(
    'TOTAL OUTSTANDING: Rp ' +
    Number(result.total_outstanding).toLocaleString('id-ID')
  );
  Logger.log(
    'PDF SIZE         : ' + result.size_bytes + ' bytes'
  );
  Logger.log(
    'MIME TYPE        : ' + result.mime_type
  );
  Logger.log(
    'DURASI           : ' +
    (result.duration_ms / 1000).toFixed(3) + ' detik'
  );
  Logger.log('==============================================');

  return result;
}


/**
 * ============================================================
 * TEST TAHAP 6B
 * ============================================================
 *
 * READ-ONLY.
 *
 * Test:
 * 1. Cari satu transaksi outstanding.
 * 2. Ambil PDF ringkasan pelanggan tersebut.
 * 3. Validasi total outstanding.
 * 4. Validasi PDF bukan 0 byte.
 * 5. Validasi MIME type PDF.
 *
 * Untuk sample saat ini diharapkan:
 * Kode pelanggan : 2102029
 * Nama           : PAK PAING
 * Invoice        : 11
 * Total          : Rp2.983.000
 */
function testStage6B() {
  const started = Date.now();

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - TAHAP 6B');
  Logger.log('TEST PDF RINGKASAN PIUTANG');
  Logger.log('READ-ONLY');
  Logger.log('==============================================');

  const sampleQuery =
    'SELECT kode,pelanggan,nama_pelanggan,piutang ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ' +
    'ORDER BY kode LIMIT 1';

  const sampleResult = sidRetailQuery(sampleQuery);

  if (!sampleResult || sampleResult.status !== 'success') {
    throw new Error(
      'Gagal mengambil transaksi sample: ' +
      JSON.stringify(sampleResult)
    );
  }

  const rows = Array.isArray(sampleResult.data)
    ? sampleResult.data
    : [];

  if (!rows.length) {
    throw new Error(
      'Tidak ada transaksi outstanding untuk test Stage 6B.'
    );
  }

  const sample = rows[0];
  const kodePelanggan = String(sample.pelanggan || '').trim();

  if (!kodePelanggan) {
    throw new Error(
      'Sample transaksi tidak memiliki kode pelanggan.'
    );
  }

  Logger.log(
    'SAMPLE PELANGGAN: ' + kodePelanggan
  );

  const result =
    getPdfRingkasanPiutangPelanggan(kodePelanggan);

  if (!result || result.status !== 'success') {
    throw new Error(
      'getPdfRingkasanPiutangPelanggan() gagal.'
    );
  }

  const validMime =
    String(result.mime_type || '').toLowerCase() ===
    'application/pdf';

  const validSize =
    Number(result.size_bytes || 0) > 0;

  const validBase64 =
    String(result.pdf_base64 || '').length > 0;

  const validTotal =
    Number(result.total_outstanding || 0) > 0;

  const valid =
    validMime &&
    validSize &&
    validBase64 &&
    validTotal;

  const output = {
    status: valid ? 'PASS' : 'CHECK_REQUIRED',
    read_only: true,
    duration_ms: Date.now() - started,
    kode_pelanggan: result.kode_pelanggan,
    nama_pelanggan: result.nama_pelanggan,
    invoice_count: result.invoice_count,
    total_outstanding: result.total_outstanding,
    filename: result.filename,
    mime_type: result.mime_type,
    size_bytes: result.size_bytes,
    base64_length: String(result.pdf_base64 || '').length,
    validation: valid
  };

  Logger.log('=== HASIL TB NUSANTARA - TAHAP 6B ===');
  Logger.log(JSON.stringify(output, null, 2));

  if (!valid) {
    throw new Error(
      'VALIDASI PDF STAGE 6B GAGAL: ' +
      JSON.stringify(output)
    );
  }

  return output;
}

/**
 * ============================================================
 * TAHAP 6C - PDF INVOICE TRANSAKSI
 * ============================================================
 *
 * READ-ONLY.
 *
 * Menggunakan getNotaTransaksi() yang sudah tervalidasi pada
 * TAHAP 5. Tidak menghitung ulang total invoice dari browser.
 *
 * TOTAL INVOICE = penjualan.jumlah
 * BAYAR         = penjualan.bayar
 * ANGSURAN      = penjualan.angsuran
 * SALDO HUTANG  = penjualan.piutang
 *
 * ============================================================
 */

function stage6cEscapeHtml_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function stage6cFormatRupiah_(value) {
  return 'Rp' + Number(value || 0).toLocaleString('id-ID');
}


function stage6cFormatNumber_(value) {
  const n = Number(value || 0);

  if (!isFinite(n)) return '0';

  return n.toLocaleString('id-ID', {
    maximumFractionDigits: 2
  });
}


function stage6cFormatDate_(value) {
  if (!value) return '';

  const date = parseSidDate(value);

  if (!date) return String(value);

  return String(date.getDate()).padStart(2, '0') + '/' +
    String(date.getMonth() + 1).padStart(2, '0') + '/' +
    date.getFullYear();
}


function stage6cBuildAddress_(header) {
  const parts = [
    header.alamat_pelanggan,
    header.alamat_pelanggan2,
    header.alamat_pelanggan3
  ];

  const cleaned = [];

  parts.forEach(function(part) {
    const value = String(part || '').trim();

    if (value && cleaned.indexOf(value) === -1) {
      cleaned.push(value);
    }
  });

  return cleaned.join(', ');
}


function buildInvoicePdfHtml_(nota) {
  if (!nota || nota.status !== 'success') {
    throw new Error('Data nota tidak valid untuk PDF invoice.');
  }

  if (!nota.header || !nota.summary) {
    throw new Error('Header atau summary nota tidak tersedia.');
  }

  const header = nota.header;
  const summary = nota.summary;
  const items = Array.isArray(nota.items)
    ? nota.items
    : [];

  let itemRows = '';

  items.forEach(function(item, index) {
    itemRows +=
      '<tr>' +
        '<td class="center">' +
          stage6cEscapeHtml_(item.no || index + 1) +
        '</td>' +
        '<td>' +
          stage6cEscapeHtml_(item.kode_barang || '') +
        '</td>' +
        '<td>' +
          stage6cEscapeHtml_(item.nama_barang || '') +
        '</td>' +
        '<td class="center">' +
          stage6cEscapeHtml_(item.satuan || '') +
        '</td>' +
        '<td class="number">' +
          stage6cEscapeHtml_(stage6cFormatNumber_(item.qty)) +
        '</td>' +
        '<td class="money">' +
          stage6cEscapeHtml_(stage6cFormatRupiah_(item.harga)) +
        '</td>' +
        '<td class="money">' +
          stage6cEscapeHtml_(stage6cFormatRupiah_(item.diskon_rupiah)) +
        '</td>' +
        '<td class="money">' +
          stage6cEscapeHtml_(stage6cFormatRupiah_(item.subtotal)) +
        '</td>' +
      '</tr>';
  });

  if (!itemRows) {
    itemRows =
      '<tr>' +
        '<td colspan="8" class="empty">Tidak ada item transaksi.</td>' +
      '</tr>';
  }

  const alamat = stage6cBuildAddress_(header);

  return '<!DOCTYPE html>' +
  '<html>' +
  '<head>' +
    '<meta charset="UTF-8">' +
    '<style>' +

      '@page {' +
        'size: A4 portrait;' +
        'margin: 12mm 11mm 13mm 11mm;' +
      '}' +

      'html, body {' +
        'margin: 0;' +
        'padding: 0;' +
        'font-family: Arial, Helvetica, sans-serif;' +
        'font-size: 8.5pt;' +
        'color: #111827;' +
      '}' +

      '.header {' +
        'border-bottom: 2px solid #111827;' +
        'padding-bottom: 7px;' +
        'margin-bottom: 11px;' +
      '}' +

      '.company {' +
        'font-size: 16pt;' +
        'font-weight: 700;' +
      '}' +

      '.legal {' +
        'font-size: 9pt;' +
        'font-weight: 700;' +
        'margin-top: 2px;' +
      '}' +

      '.company-detail {' +
        'font-size: 8pt;' +
        'line-height: 1.35;' +
        'margin-top: 3px;' +
      '}' +

      '.invoice-title {' +
        'text-align: center;' +
        'font-size: 14pt;' +
        'font-weight: 700;' +
        'letter-spacing: .4px;' +
        'margin: 9px 0 11px;' +
      '}' +

      '.meta-wrap {' +
        'width: 100%;' +
        'border-collapse: collapse;' +
        'margin-bottom: 10px;' +
      '}' +

      '.meta-wrap td {' +
        'vertical-align: top;' +
        'padding: 2px 0;' +
      '}' +

      '.meta-left {' +
        'width: 56%;' +
      '}' +

      '.meta-right {' +
        'width: 44%;' +
      '}' +

      '.meta-table {' +
        'border-collapse: collapse;' +
        'width: 100%;' +
      '}' +

      '.meta-table td {' +
        'padding: 2px 0;' +
      '}' +

      '.label {' +
        'font-weight: 700;' +
        'width: 31mm;' +
      '}' +

      '.sep {' +
        'width: 4mm;' +
        'text-align: center;' +
      '}' +

      '.items {' +
        'width: 100%;' +
        'border-collapse: collapse;' +
        'table-layout: fixed;' +
        'font-size: 7.5pt;' +
      '}' +

      '.items thead {' +
        'display: table-header-group;' +
      '}' +

      '.items th {' +
        'background: #111827;' +
        'color: white;' +
        'border: 1px solid #111827;' +
        'padding: 5px 3px;' +
        'text-align: center;' +
      '}' +

      '.items td {' +
        'border: 1px solid #9ca3af;' +
        'padding: 4px 3px;' +
        'vertical-align: middle;' +
        'word-wrap: break-word;' +
      '}' +

      '.items th:nth-child(1), .items td:nth-child(1) { width: 5%; }' +
      '.items th:nth-child(2), .items td:nth-child(2) { width: 13%; }' +
      '.items th:nth-child(3), .items td:nth-child(3) { width: 25%; }' +
      '.items th:nth-child(4), .items td:nth-child(4) { width: 7%; }' +
      '.items th:nth-child(5), .items td:nth-child(5) { width: 8%; }' +
      '.items th:nth-child(6), .items td:nth-child(6) { width: 14%; }' +
      '.items th:nth-child(7), .items td:nth-child(7) { width: 10%; }' +
      '.items th:nth-child(8), .items td:nth-child(8) { width: 18%; }' +

      '.center {' +
        'text-align: center;' +
      '}' +

      '.number {' +
        'text-align: right;' +
        'white-space: nowrap;' +
      '}' +

      '.money {' +
        'text-align: right;' +
        'white-space: nowrap;' +
      '}' +

      '.empty {' +
        'text-align: center;' +
        'padding: 12px;' +
      '}' +

      '.summary-wrap {' +
        'width: 100%;' +
        'border-collapse: collapse;' +
        'margin-top: 10px;' +
      '}' +

      '.summary-spacer {' +
        'width: 58%;' +
      '}' +

      '.summary-box {' +
        'width: 42%;' +
      '}' +

      '.summary-table {' +
        'width: 100%;' +
        'border-collapse: collapse;' +
      '}' +

      '.summary-table td {' +
        'border: 1px solid #9ca3af;' +
        'padding: 5px;' +
      '}' +

      '.summary-table .summary-label {' +
        'font-weight: 700;' +
      '}' +

      '.summary-table .summary-value {' +
        'text-align: right;' +
        'white-space: nowrap;' +
      '}' +

      '.summary-table .balance td {' +
        'border: 1.5px solid #111827;' +
        'font-size: 9.5pt;' +
        'font-weight: 700;' +
      '}' +

      '.notes {' +
        'margin-top: 13px;' +
        'font-size: 7.5pt;' +
        'line-height: 1.4;' +
      '}' +

      '.footer {' +
        'margin-top: 10px;' +
        'text-align: right;' +
        'font-size: 7pt;' +
        'color: #6b7280;' +
      '}' +

      'tr {' +
        'page-break-inside: avoid;' +
      '}' +

    '</style>' +
  '</head>' +

  '<body>' +

    '<div class="header">' +
      '<div class="company">TB NUSANTARA</div>' +
      '<div class="legal">CV NUSANTARA BUILDING MATERIAL</div>' +
      '<div class="company-detail">' +
        'JL. LINTAS SELATAN SUROREJAN PURING<br>' +
        '081234563843' +
      '</div>' +
    '</div>' +

    '<div class="invoice-title">NOTA PENJUALAN</div>' +

    '<table class="meta-wrap">' +
      '<tr>' +

        '<td class="meta-left">' +
          '<table class="meta-table">' +
            '<tr>' +
              '<td class="label">No. Nota</td>' +
              '<td class="sep">:</td>' +
              '<td>' +
                stage6cEscapeHtml_(header.kode_transaksi) +
              '</td>' +
            '</tr>' +

            '<tr>' +
              '<td class="label">Tanggal</td>' +
              '<td class="sep">:</td>' +
              '<td>' +
                stage6cEscapeHtml_(stage6cFormatDate_(header.tanggal)) +
              '</td>' +
            '</tr>' +

            '<tr>' +
              '<td class="label">Jatuh Tempo</td>' +
              '<td class="sep">:</td>' +
              '<td>' +
                stage6cEscapeHtml_(stage6cFormatDate_(header.jatuh_tempo)) +
              '</td>' +
            '</tr>' +
          '</table>' +
        '</td>' +

        '<td class="meta-right">' +
          '<table class="meta-table">' +
            '<tr>' +
              '<td class="label">Pelanggan</td>' +
              '<td class="sep">:</td>' +
              '<td>' +
                stage6cEscapeHtml_(header.nama_pelanggan || '') +
              '</td>' +
            '</tr>' +

            '<tr>' +
              '<td class="label">Kode Pelanggan</td>' +
              '<td class="sep">:</td>' +
              '<td>' +
                stage6cEscapeHtml_(header.kode_pelanggan || '') +
              '</td>' +
            '</tr>' +

            '<tr>' +
              '<td class="label">Telepon</td>' +
              '<td class="sep">:</td>' +
              '<td>' +
                stage6cEscapeHtml_(header.telp_pelanggan || '') +
              '</td>' +
            '</tr>' +
          '</table>' +
        '</td>' +

      '</tr>' +

      '<tr>' +
        '<td colspan="2">' +
          '<table class="meta-table">' +
            '<tr>' +
              '<td class="label">Alamat</td>' +
              '<td class="sep">:</td>' +
              '<td>' +
                stage6cEscapeHtml_(alamat) +
              '</td>' +
            '</tr>' +
          '</table>' +
        '</td>' +
      '</tr>' +

    '</table>' +

    '<table class="items">' +
      '<thead>' +
        '<tr>' +
          '<th>No</th>' +
          '<th>Kode Barang</th>' +
          '<th>Nama Barang</th>' +
          '<th>Satuan</th>' +
          '<th>Qty</th>' +
          '<th>Harga</th>' +
          '<th>Diskon</th>' +
          '<th>Subtotal</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        itemRows +
      '</tbody>' +
    '</table>' +

    '<table class="summary-wrap">' +
      '<tr>' +
        '<td class="summary-spacer"></td>' +
        '<td class="summary-box">' +
          '<table class="summary-table">' +

            '<tr>' +
              '<td class="summary-label">TOTAL INVOICE</td>' +
              '<td class="summary-value">' +
                stage6cEscapeHtml_(stage6cFormatRupiah_(summary.jumlah)) +
              '</td>' +
            '</tr>' +

            '<tr>' +
              '<td class="summary-label">BAYAR</td>' +
              '<td class="summary-value">' +
                stage6cEscapeHtml_(stage6cFormatRupiah_(summary.bayar)) +
              '</td>' +
            '</tr>' +

            '<tr>' +
              '<td class="summary-label">ANGSURAN</td>' +
              '<td class="summary-value">' +
                stage6cEscapeHtml_(stage6cFormatRupiah_(summary.angsuran)) +
              '</td>' +
            '</tr>' +

            '<tr class="balance">' +
              '<td>SALDO HUTANG</td>' +
              '<td class="summary-value">' +
                stage6cEscapeHtml_(stage6cFormatRupiah_(summary.piutang)) +
              '</td>' +
            '</tr>' +

          '</table>' +
        '</td>' +
      '</tr>' +
    '</table>' +

    '<div class="notes">' +
      '<strong>Catatan:</strong> Dokumen ini merupakan cetakan informasi ' +
      'transaksi berdasarkan data sistem TB Nusantara.' +
    '</div>' +

    '<div class="footer">' +
      'TB Nusantara — CV Nusantara Building Material' +
    '</div>' +

  '</body>' +
  '</html>';
}


/**
 * Menghasilkan satu PDF A4 untuk satu invoice.
 */
function getPdfInvoiceTransaksi(kodeTransaksi) {
  const kode = validateStage6TransactionCode_(kodeTransaksi);
  const started = Date.now();

  // Gunakan jalur piutang khusus 6D.1 agar saldo hutang
  // memakai penjualan.piutang sebagai saldo aktual.
  // Jalur ini sengaja tidak menggunakan getNotaTransaksi()
  // karena data historis tertentu tidak memenuhi rumus
  // piutang = jumlah - bayar - angsuran.
  const nota = getNotaTransaksiUntukPiutangPdf(kode);

  if (!nota || nota.status !== 'success') {
    throw new Error(
      'Gagal mengambil nota transaksi untuk PDF piutang: ' + kode
    );
  }

  if (!nota.header || nota.header.kode_transaksi !== kode) {
    throw new Error(
      'Validasi header invoice gagal: ' + kode
    );
  }

  if (!nota.summary) {
    throw new Error(
      'Summary invoice tidak tersedia: ' + kode
    );
  }

  if (Number(nota.summary.piutang || 0) <= 0) {
    throw new Error(
      'Invoice ' + kode +
      ' tidak memiliki saldo piutang outstanding.'
    );
  }

  const html = buildInvoicePdfHtml_(nota);

  const htmlOutput = HtmlService
    .createHtmlOutput(html)
    .setWidth(794)
    .setHeight(1123);

  const pdfBlob = htmlOutput
    .getBlob()
    .getAs(MimeType.PDF);

  const bytes = pdfBlob.getBytes();

  if (!bytes || !bytes.length) {
    throw new Error(
      'PDF invoice gagal dibuat: ukuran 0 byte.'
    );
  }

  const safeKode =
    kode.replace(/[^a-zA-Z0-9._-]+/g, '_');

  const filename =
    'Invoice_' + safeKode + '.pdf';

  pdfBlob.setName(filename);

  const result = {
    status: 'success',
    filename: filename,
    mime_type: pdfBlob.getContentType(),
    size_bytes: bytes.length,
    kode_transaksi: nota.header.kode_transaksi,
    tanggal: nota.header.tanggal,
    jatuh_tempo: nota.header.jatuh_tempo,
    kode_pelanggan: nota.header.kode_pelanggan,
    nama_pelanggan: nota.header.nama_pelanggan,
    item_count: nota.items.length,
    total_invoice: nota.summary.jumlah,
    bayar: nota.summary.bayar,
    angsuran: nota.summary.angsuran,
    saldo_hutang: nota.summary.piutang,
    pdf_base64: Utilities.base64Encode(bytes),
    duration_ms: Date.now() - started
  };

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - TAHAP 6C');
  Logger.log('PDF INVOICE TRANSAKSI');
  Logger.log('==============================================');
  Logger.log('NO. NOTA         : ' + result.kode_transaksi);
  Logger.log('PELANGGAN        : ' + result.nama_pelanggan);
  Logger.log('KODE PELANGGAN   : ' + result.kode_pelanggan);
  Logger.log('JUMLAH ITEM      : ' + result.item_count);
  Logger.log(
    'TOTAL INVOICE    : Rp ' +
    Number(result.total_invoice).toLocaleString('id-ID')
  );
  Logger.log(
    'BAYAR            : Rp ' +
    Number(result.bayar).toLocaleString('id-ID')
  );
  Logger.log(
    'ANGSURAN         : Rp ' +
    Number(result.angsuran).toLocaleString('id-ID')
  );
  Logger.log(
    'SALDO HUTANG     : Rp ' +
    Number(result.saldo_hutang).toLocaleString('id-ID')
  );
  Logger.log('PDF SIZE         : ' + result.size_bytes + ' bytes');
  Logger.log('MIME TYPE        : ' + result.mime_type);
  Logger.log(
    'DURASI           : ' +
    (result.duration_ms / 1000).toFixed(3) +
    ' detik'
  );
  Logger.log('==============================================');

  return result;
}


/**
 * ============================================================
 * TEST TAHAP 6C
 * ============================================================
 *
 * READ-ONLY.
 *
 * Sample diharapkan:
 * No. Nota      : R43-010126004
 * Pelanggan     : PAK PAING
 * Total Invoice : Rp225.000
 * Bayar         : Rp0
 * Angsuran      : Rp0
 * Saldo Hutang  : Rp225.000
 */
function testStage6C() {
  const started = Date.now();

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - TAHAP 6C');
  Logger.log('TEST PDF INVOICE');
  Logger.log('READ-ONLY');
  Logger.log('==============================================');

  const sampleQuery =
    'SELECT kode,tanggal,pelanggan,nama_pelanggan,' +
    'jumlah,bayar,angsuran,piutang ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ' +
    'ORDER BY kode LIMIT 1';

  const sampleResult = sidRetailQuery(sampleQuery);

  if (!sampleResult || sampleResult.status !== 'success') {
    throw new Error(
      'Gagal mengambil transaksi sample: ' +
      JSON.stringify(sampleResult)
    );
  }

  const rows = Array.isArray(sampleResult.data)
    ? sampleResult.data
    : [];

  if (!rows.length) {
    throw new Error(
      'Tidak ada transaksi outstanding untuk test Stage 6C.'
    );
  }

  const sample = rows[0];
  const kode = String(sample.kode || '').trim();

  if (!kode) {
    throw new Error(
      'Sample transaksi tidak memiliki kode.'
    );
  }

  Logger.log('SAMPLE TRANSAKSI: ' + kode);

  const result = getPdfInvoiceTransaksi(kode);

  const expectedJumlah = Number(sample.jumlah || 0);
  const expectedBayar = Number(sample.bayar || 0);
  const expectedAngsuran = Number(sample.angsuran || 0);
  const expectedPiutang = Number(sample.piutang || 0);

  const validData =
    Math.abs(
      Number(result.total_invoice || 0) - expectedJumlah
    ) <= 0.01 &&
    Math.abs(
      Number(result.bayar || 0) - expectedBayar
    ) <= 0.01 &&
    Math.abs(
      Number(result.angsuran || 0) - expectedAngsuran
    ) <= 0.01 &&
    Math.abs(
      Number(result.saldo_hutang || 0) - expectedPiutang
    ) <= 0.01;

  const validPdf =
    String(result.mime_type || '').toLowerCase() ===
      'application/pdf' &&
    Number(result.size_bytes || 0) > 0 &&
    String(result.pdf_base64 || '').length > 0;

  const valid =
    result.status === 'success' &&
    result.kode_transaksi === kode &&
    validData &&
    validPdf;

  const output = {
    status: valid ? 'PASS' : 'CHECK_REQUIRED',
    read_only: true,
    duration_ms: Date.now() - started,
    kode_transaksi: result.kode_transaksi,
    nama_pelanggan: result.nama_pelanggan,
    item_count: result.item_count,
    total_invoice: result.total_invoice,
    bayar: result.bayar,
    angsuran: result.angsuran,
    saldo_hutang: result.saldo_hutang,
    filename: result.filename,
    mime_type: result.mime_type,
    size_bytes: result.size_bytes,
    base64_length: String(result.pdf_base64 || '').length,
    validation_data: validData,
    validation_pdf: validPdf,
    validation: valid
  };

  Logger.log('=== HASIL TB NUSANTARA - TAHAP 6C ===');
  Logger.log(JSON.stringify(output, null, 2));

  if (!valid) {
    throw new Error(
      'VALIDASI PDF STAGE 6C GAGAL: ' +
      JSON.stringify(output)
    );
  }

  return output;
}


/**
 * ============================================================
 * TAHAP 6D - PDF SEMUA DETAIL PIUTANG
 * ============================================================
 *
 * READ-ONLY.
 *
 * Satu pelanggan -> satu PDF A4 multi-page.
 *
 * Sumber data:
 *   getSemuaNotaOutstanding(kodePelanggan)
 *
 * Setiap invoice ditampilkan lengkap beserta item barangnya.
 *
 * Validasi:
 *   SUM seluruh saldo hutang invoice
 *   harus sama dengan total outstanding Stage 6A.
 *
 * ============================================================
 */

function stage6dEscapeHtml_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function stage6dFormatRupiah_(value) {
  return 'Rp' + Number(value || 0).toLocaleString('id-ID');
}


function stage6dFormatNumber_(value) {
  const n = Number(value || 0);

  if (!isFinite(n)) return '0';

  return n.toLocaleString('id-ID', {
    maximumFractionDigits: 2
  });
}


function stage6dFormatDate_(value) {
  if (!value) return '';

  const date = parseSidDate(value);

  if (!date) return String(value);

  return String(date.getDate()).padStart(2, '0') + '/' +
    String(date.getMonth() + 1).padStart(2, '0') + '/' +
    date.getFullYear();
}


function stage6dBuildAddress_(header) {
  const parts = [
    header.alamat_pelanggan,
    header.alamat_pelanggan2,
    header.alamat_pelanggan3
  ];

  const cleaned = [];

  parts.forEach(function(part) {
    const value = String(part || '').trim();

    if (value && cleaned.indexOf(value) === -1) {
      cleaned.push(value);
    }
  });

  return cleaned.join(', ');
}


function stage6dBuildInvoiceHtml_(nota, invoiceIndex) {
  const header = nota.header || {};
  const summary = nota.summary || {};
  const items = Array.isArray(nota.items)
    ? nota.items
    : [];

  let itemRows = '';

  items.forEach(function(item, index) {
    itemRows +=
      '<tr>' +
        '<td class="center">' +
          stage6dEscapeHtml_(item.no || index + 1) +
        '</td>' +
        '<td>' +
          stage6dEscapeHtml_(item.kode_barang || '') +
        '</td>' +
        '<td>' +
          stage6dEscapeHtml_(item.nama_barang || '') +
        '</td>' +
        '<td class="center">' +
          stage6dEscapeHtml_(item.satuan || '') +
        '</td>' +
        '<td class="number">' +
          stage6dEscapeHtml_(stage6dFormatNumber_(item.qty)) +
        '</td>' +
        '<td class="money">' +
          stage6dEscapeHtml_(stage6dFormatRupiah_(item.harga)) +
        '</td>' +
        '<td class="money">' +
          stage6dEscapeHtml_(stage6dFormatRupiah_(item.diskon_rupiah)) +
        '</td>' +
        '<td class="money">' +
          stage6dEscapeHtml_(stage6dFormatRupiah_(item.subtotal)) +
        '</td>' +
      '</tr>';
  });

  if (!itemRows) {
    itemRows =
      '<tr>' +
        '<td colspan="8" class="empty">' +
          'Tidak ada item transaksi.' +
        '</td>' +
      '</tr>';
  }

  const alamat = stage6dBuildAddress_(header);

  return (
    '<section class="invoice">' +

      '<div class="invoice-top">' +
        '<div>' +
          '<div class="company">TB NUSANTARA</div>' +
          '<div class="legal">CV NUSANTARA BUILDING MATERIAL</div>' +
          '<div class="company-detail">' +
            'JL. LINTAS SELATAN SUROREJAN PURING<br>' +
            '081234563843' +
          '</div>' +
        '</div>' +

        '<div class="document-number">' +
          '<div class="small-label">NOTA</div>' +
          '<div class="invoice-code">' +
            stage6dEscapeHtml_(header.kode_transaksi || '') +
          '</div>' +
          '<div class="small-label">' +
            'Invoice ' + (invoiceIndex + 1) +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="meta-grid">' +

        '<div>' +
          '<table class="meta-table">' +
            '<tr>' +
              '<td class="label">Tanggal</td>' +
              '<td class="sep">:</td>' +
              '<td>' +
                stage6dEscapeHtml_(stage6dFormatDate_(header.tanggal)) +
              '</td>' +
            '</tr>' +

            '<tr>' +
              '<td class="label">Jatuh Tempo</td>' +
              '<td class="sep">:</td>' +
              '<td>' +
                stage6dEscapeHtml_(stage6dFormatDate_(header.jatuh_tempo)) +
              '</td>' +
            '</tr>' +
          '</table>' +
        '</div>' +

        '<div>' +
          '<table class="meta-table">' +
            '<tr>' +
              '<td class="label">Pelanggan</td>' +
              '<td class="sep">:</td>' +
              '<td>' +
                stage6dEscapeHtml_(header.nama_pelanggan || '') +
              '</td>' +
            '</tr>' +

            '<tr>' +
              '<td class="label">Kode</td>' +
              '<td class="sep">:</td>' +
              '<td>' +
                stage6dEscapeHtml_(header.kode_pelanggan || '') +
              '</td>' +
            '</tr>' +
          '</table>' +
        '</div>' +

      '</div>' +

      '<div class="address">' +
        '<strong>Alamat:</strong> ' +
        stage6dEscapeHtml_(alamat) +
      '</div>' +

      '<table class="items">' +
        '<thead>' +
          '<tr>' +
            '<th>No</th>' +
            '<th>Kode Barang</th>' +
            '<th>Nama Barang</th>' +
            '<th>Satuan</th>' +
            '<th>Qty</th>' +
            '<th>Harga</th>' +
            '<th>Diskon</th>' +
            '<th>Subtotal</th>' +
          '</tr>' +
        '</thead>' +

        '<tbody>' +
          itemRows +
        '</tbody>' +
      '</table>' +

      '<table class="summary">' +
        '<tr>' +
          '<td class="summary-spacer"></td>' +
          '<td class="summary-box">' +
            '<table>' +
              '<tr>' +
                '<td class="label">TOTAL INVOICE</td>' +
                '<td class="value">' +
                  stage6dEscapeHtml_(
                    stage6dFormatRupiah_(summary.jumlah)
                  ) +
                '</td>' +
              '</tr>' +

              '<tr>' +
                '<td class="label">BAYAR</td>' +
                '<td class="value">' +
                  stage6dEscapeHtml_(
                    stage6dFormatRupiah_(summary.bayar)
                  ) +
                '</td>' +
              '</tr>' +

              '<tr>' +
                '<td class="label">ANGSURAN</td>' +
                '<td class="value">' +
                  stage6dEscapeHtml_(
                    stage6dFormatRupiah_(summary.angsuran)
                  ) +
                '</td>' +
              '</tr>' +

              '<tr class="balance">' +
                '<td class="label">SALDO HUTANG</td>' +
                '<td class="value">' +
                  stage6dEscapeHtml_(
                    stage6dFormatRupiah_(summary.piutang)
                  ) +
                '</td>' +
              '</tr>' +

            '</table>' +
          '</td>' +
        '</tr>' +
      '</table>' +

    '</section>'
  );
}


function buildSemuaDetailPiutangPdfHtml_(data) {
  if (!data || data.status !== 'success') {
    throw new Error('Data semua detail PDF tidak valid.');
  }

  const invoices = Array.isArray(data.invoices)
    ? data.invoices
    : [];

  let invoiceSections = '';

  invoices.forEach(function(nota, index) {
    if (!nota || nota.status !== 'success') {
      throw new Error(
        'Data invoice #' + (index + 1) + ' tidak valid.'
      );
    }

    invoiceSections +=
      stage6dBuildInvoiceHtml_(nota, index);
  });

  if (!invoiceSections) {
    invoiceSections =
      '<div class="empty-document">' +
        'Tidak ada invoice outstanding.' +
      '</div>';
  }

  const generatedDate =
    formatSidDate(new Date());

  return '<!DOCTYPE html>' +
  '<html>' +
  '<head>' +
    '<meta charset="UTF-8">' +

    '<style>' +

      '@page {' +
        'size: A4 portrait;' +
        'margin: 11mm 10mm 12mm 10mm;' +
      '}' +

      'html, body {' +
        'margin: 0;' +
        'padding: 0;' +
        'font-family: Arial, Helvetica, sans-serif;' +
        'font-size: 8pt;' +
        'color: #111827;' +
      '}' +

      '.cover {' +
        'page-break-after: always;' +
        'padding-top: 45mm;' +
        'text-align: center;' +
      '}' +

      '.cover-company {' +
        'font-size: 21pt;' +
        'font-weight: 700;' +
      '}' +

      '.cover-legal {' +
        'font-size: 11pt;' +
        'font-weight: 700;' +
        'margin-top: 4px;' +
      '}' +

      '.cover-title {' +
        'font-size: 17pt;' +
        'font-weight: 700;' +
        'margin-top: 45mm;' +
        'letter-spacing: .5px;' +
      '}' +

      '.cover-customer {' +
        'font-size: 12pt;' +
        'margin-top: 12px;' +
      '}' +

      '.cover-total {' +
        'font-size: 16pt;' +
        'font-weight: 700;' +
        'margin-top: 18px;' +
      '}' +

      '.cover-date {' +
        'font-size: 8pt;' +
        'color: #6b7280;' +
        'margin-top: 20px;' +
      '}' +

      '.invoice {' +
        'page-break-before: always;' +
      '}' +

      '.invoice:first-of-type {' +
        'page-break-before: auto;' +
      '}' +

      '.invoice-top {' +
        'display: table;' +
        'width: 100%;' +
        'border-bottom: 2px solid #111827;' +
        'padding-bottom: 6px;' +
        'margin-bottom: 9px;' +
      '}' +

      '.invoice-top > div {' +
        'display: table-cell;' +
        'vertical-align: top;' +
      '}' +

      '.document-number {' +
        'text-align: right;' +
        'width: 35%;' +
      '}' +

      '.company {' +
        'font-size: 14pt;' +
        'font-weight: 700;' +
      '}' +

      '.legal {' +
        'font-size: 8.5pt;' +
        'font-weight: 700;' +
        'margin-top: 2px;' +
      '}' +

      '.company-detail {' +
        'font-size: 7.5pt;' +
        'line-height: 1.35;' +
        'margin-top: 2px;' +
      '}' +

      '.small-label {' +
        'font-size: 7pt;' +
        'color: #6b7280;' +
      '}' +

      '.invoice-code {' +
        'font-size: 12pt;' +
        'font-weight: 700;' +
        'margin: 2px 0;' +
      '}' +

      '.meta-grid {' +
        'display: table;' +
        'width: 100%;' +
        'margin-bottom: 5px;' +
      '}' +

      '.meta-grid > div {' +
        'display: table-cell;' +
        'width: 50%;' +
        'vertical-align: top;' +
      '}' +

      '.meta-table {' +
        'width: 100%;' +
        'border-collapse: collapse;' +
      '}' +

      '.meta-table td {' +
        'padding: 2px 0;' +
        'vertical-align: top;' +
      '}' +

      '.meta-table .label {' +
        'font-weight: 700;' +
        'width: 24mm;' +
      '}' +

      '.meta-table .sep {' +
        'width: 3mm;' +
        'text-align: center;' +
      '}' +

      '.address {' +
        'border: 1px solid #d1d5db;' +
        'padding: 5px;' +
        'margin-bottom: 7px;' +
        'min-height: 10px;' +
      '}' +

      '.items {' +
        'width: 100%;' +
        'border-collapse: collapse;' +
        'table-layout: fixed;' +
        'font-size: 7pt;' +
      '}' +

      '.items thead {' +
        'display: table-header-group;' +
      '}' +

      '.items th {' +
        'background: #111827;' +
        'color: #ffffff;' +
        'border: 1px solid #111827;' +
        'padding: 4px 2px;' +
        'text-align: center;' +
      '}' +

      '.items td {' +
        'border: 1px solid #9ca3af;' +
        'padding: 3px 2px;' +
        'vertical-align: middle;' +
        'word-wrap: break-word;' +
      '}' +

      '.items th:nth-child(1), .items td:nth-child(1) { width: 5%; }' +
      '.items th:nth-child(2), .items td:nth-child(2) { width: 13%; }' +
      '.items th:nth-child(3), .items td:nth-child(3) { width: 25%; }' +
      '.items th:nth-child(4), .items td:nth-child(4) { width: 7%; }' +
      '.items th:nth-child(5), .items td:nth-child(5) { width: 8%; }' +
      '.items th:nth-child(6), .items td:nth-child(6) { width: 14%; }' +
      '.items th:nth-child(7), .items td:nth-child(7) { width: 10%; }' +
      '.items th:nth-child(8), .items td:nth-child(8) { width: 18%; }' +

      '.center {' +
        'text-align: center;' +
      '}' +

      '.number {' +
        'text-align: right;' +
        'white-space: nowrap;' +
      '}' +

      '.money {' +
        'text-align: right;' +
        'white-space: nowrap;' +
      '}' +

      '.summary {' +
        'width: 100%;' +
        'border-collapse: collapse;' +
        'margin-top: 7px;' +
      '}' +

      '.summary-spacer {' +
        'width: 58%;' +
      '}' +

      '.summary-box {' +
        'width: 42%;' +
      '}' +

      '.summary-box table {' +
        'width: 100%;' +
        'border-collapse: collapse;' +
      '}' +

      '.summary-box td {' +
        'border: 1px solid #9ca3af;' +
        'padding: 4px;' +
      '}' +

      '.summary-box .label {' +
        'font-weight: 700;' +
      '}' +

      '.summary-box .value {' +
        'text-align: right;' +
        'white-space: nowrap;' +
      '}' +

      '.summary-box .balance td {' +
        'border: 1.5px solid #111827;' +
        'font-weight: 700;' +
      '}' +

      '.empty, .empty-document {' +
        'text-align: center;' +
        'padding: 20px;' +
      '}' +

      '.final-summary {' +
        'page-break-before: always;' +
        'padding-top: 20mm;' +
      '}' +

      '.final-summary h2 {' +
        'text-align: center;' +
        'font-size: 15pt;' +
        'margin-bottom: 18px;' +
      '}' +

      '.final-box {' +
        'width: 70%;' +
        'margin: 0 auto;' +
        'border-collapse: collapse;' +
      '}' +

      '.final-box td {' +
        'border: 1px solid #9ca3af;' +
        'padding: 8px;' +
      '}' +

      '.final-box .value {' +
        'text-align: right;' +
        'white-space: nowrap;' +
      '}' +

      '.final-box .total td {' +
        'border: 2px solid #111827;' +
        'font-size: 12pt;' +
        'font-weight: 700;' +
      '}' +

      '.footer-note {' +
        'text-align: center;' +
        'font-size: 7pt;' +
        'color: #6b7280;' +
        'margin-top: 25px;' +
      '}' +

    '</style>' +
  '</head>' +

  '<body>' +

    '<section class="cover">' +
      '<div class="cover-company">TB NUSANTARA</div>' +
      '<div class="cover-legal">CV NUSANTARA BUILDING MATERIAL</div>' +
      '<div>' +
        'JL. LINTAS SELATAN SUROREJAN PURING<br>' +
        '081234563843' +
      '</div>' +

      '<div class="cover-title">' +
        'SEMUA DETAIL PIUTANG' +
      '</div>' +

      '<div class="cover-customer">' +
        '<strong>' +
          stage6dEscapeHtml_(data.nama_pelanggan || '') +
        '</strong><br>' +
        'Kode: ' +
        stage6dEscapeHtml_(data.kode_pelanggan || '') +
      '</div>' +

      '<div class="cover-total">' +
        stage6dEscapeHtml_(
          stage6dFormatRupiah_(data.total_outstanding)
        ) +
      '</div>' +

      '<div class="cover-date">' +
        'Tanggal: ' +
        stage6dEscapeHtml_(stage6dFormatDate_(generatedDate)) +
      '</div>' +
    '</section>' +

    invoiceSections +

    '<section class="final-summary">' +
      '<h2>RINGKASAN TOTAL PIUTANG</h2>' +

      '<table class="final-box">' +
        '<tr>' +
          '<td>Pelanggan</td>' +
          '<td class="value">' +
            stage6dEscapeHtml_(data.nama_pelanggan || '') +
          '</td>' +
        '</tr>' +

        '<tr>' +
          '<td>Kode Pelanggan</td>' +
          '<td class="value">' +
            stage6dEscapeHtml_(data.kode_pelanggan || '') +
          '</td>' +
        '</tr>' +

        '<tr>' +
          '<td>Jumlah Invoice</td>' +
          '<td class="value">' +
            stage6dEscapeHtml_(data.count || 0) +
          '</td>' +
        '</tr>' +

        '<tr class="total">' +
          '<td>TOTAL OUTSTANDING</td>' +
          '<td class="value">' +
            stage6dEscapeHtml_(
              stage6dFormatRupiah_(data.total_outstanding)
            ) +
          '</td>' +
        '</tr>' +
      '</table>' +

      '<div class="footer-note">' +
        'Dokumen ini dibuat berdasarkan data outstanding ' +
        'TB Nusantara dan bersifat READ-ONLY.' +
      '</div>' +
    '</section>' +

  '</body>' +
  '</html>';
}


/**
 * Menghasilkan satu PDF A4 multi-page untuk seluruh invoice
 * outstanding satu pelanggan.
 */
function getPdfSemuaDetailPiutang(kodePelanggan) {
  const kode = validateStage6CustomerCode_(kodePelanggan);
  const started = Date.now();

  const data = getSemuaNotaOutstanding(kode);

  if (!data || data.status !== 'success') {
    throw new Error(
      'Gagal mengambil semua detail outstanding pelanggan.'
    );
  }

  if (!Array.isArray(data.invoices)) {
    throw new Error(
      'Data invoices Stage 6D tidak valid.'
    );
  }

  let calculatedTotal = 0;

  data.invoices.forEach(function(nota, index) {
    if (!nota || !nota.summary) {
      throw new Error(
        'Invoice #' + (index + 1) +
        ' tidak memiliki summary.'
      );
    }

    calculatedTotal +=
      Number(nota.summary.piutang || 0);
  });

  const expectedTotal =
    Number(data.total_outstanding || 0);

  const difference =
    calculatedTotal - expectedTotal;

  if (Math.abs(difference) > 0.01) {
    throw new Error(
      'Validasi total Stage 6D gagal. ' +
      'Expected=' + expectedTotal +
      ', calculated=' + calculatedTotal
    );
  }

  const html =
    buildSemuaDetailPiutangPdfHtml_(data);

  const htmlOutput = HtmlService
    .createHtmlOutput(html)
    .setWidth(794)
    .setHeight(1123);

  const pdfBlob = htmlOutput
    .getBlob()
    .getAs(MimeType.PDF);

  const bytes = pdfBlob.getBytes();

  if (!bytes || !bytes.length) {
    throw new Error(
      'PDF semua detail gagal dibuat: ukuran 0 byte.'
    );
  }

  const safeKode =
    String(data.kode_pelanggan || kode)
      .replace(/[^a-zA-Z0-9._-]+/g, '_');

  const filename =
    'Semua_Detail_Piutang_' +
    safeKode +
    '.pdf';

  pdfBlob.setName(filename);

  const result = {
    status: 'success',
    filename: filename,
    mime_type: pdfBlob.getContentType(),
    size_bytes: bytes.length,
    kode_pelanggan: data.kode_pelanggan,
    nama_pelanggan: data.nama_pelanggan,
    invoice_count: data.count,
    total_outstanding: data.total_outstanding,
    calculated_total: calculatedTotal,
    validation_difference: difference,
    pdf_base64: Utilities.base64Encode(bytes),
    duration_ms: Date.now() - started
  };

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - TAHAP 6D');
  Logger.log('PDF SEMUA DETAIL PIUTANG');
  Logger.log('==============================================');
  Logger.log('PELANGGAN        : ' + result.nama_pelanggan);
  Logger.log('KODE             : ' + result.kode_pelanggan);
  Logger.log('JUMLAH INVOICE   : ' + result.invoice_count);
  Logger.log(
    'TOTAL OUTSTANDING: Rp ' +
    Number(result.total_outstanding)
      .toLocaleString('id-ID')
  );
  Logger.log(
    'TOTAL CALCULATED : Rp ' +
    Number(result.calculated_total)
      .toLocaleString('id-ID')
  );
  Logger.log(
    'SELISIH          : Rp ' +
    Number(result.validation_difference)
      .toLocaleString('id-ID')
  );
  Logger.log('PDF SIZE         : ' + result.size_bytes + ' bytes');
  Logger.log('MIME TYPE        : ' + result.mime_type);
  Logger.log(
    'DURASI           : ' +
    (result.duration_ms / 1000).toFixed(3) +
    ' detik'
  );
  Logger.log('==============================================');

  return result;
}


/**
 * ============================================================
 * TEST TAHAP 6D
 * ============================================================
 *
 * READ-ONLY.
 *
 * Test menggunakan pelanggan dari transaksi outstanding pertama.
 *
 * Untuk sample yang sudah tervalidasi:
 *   Kode       : 2102029
 *   Pelanggan  : PAK PAING
 *   Invoice    : 11
 *   Total      : Rp2.983.000
 */
function testStage6D() {
  const started = Date.now();

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - TAHAP 6D');
  Logger.log('TEST PDF SEMUA DETAIL');
  Logger.log('READ-ONLY');
  Logger.log('==============================================');

  const sampleQuery =
    'SELECT kode,pelanggan,nama_pelanggan,piutang ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ' +
    'ORDER BY kode LIMIT 1';

  const sampleResult =
    sidRetailQuery(sampleQuery);

  if (!sampleResult ||
      sampleResult.status !== 'success') {
    throw new Error(
      'Gagal mengambil transaksi sample: ' +
      JSON.stringify(sampleResult)
    );
  }

  const rows =
    Array.isArray(sampleResult.data)
      ? sampleResult.data
      : [];

  if (!rows.length) {
    throw new Error(
      'Tidak ada transaksi outstanding untuk test Stage 6D.'
    );
  }

  const kodePelanggan =
    String(rows[0].pelanggan || '').trim();

  if (!kodePelanggan) {
    throw new Error(
      'Sample transaksi tidak memiliki kode pelanggan.'
    );
  }

  Logger.log(
    'SAMPLE PELANGGAN: ' + kodePelanggan
  );

  const result =
    getPdfSemuaDetailPiutang(kodePelanggan);

  const validPdf =
    String(result.mime_type || '').toLowerCase() ===
      'application/pdf' &&
    Number(result.size_bytes || 0) > 0 &&
    String(result.pdf_base64 || '').length > 0;

  const validTotal =
    Math.abs(
      Number(result.total_outstanding || 0) -
      Number(result.calculated_total || 0)
    ) <= 0.01 &&
    Math.abs(
      Number(result.validation_difference || 0)
    ) <= 0.01;

  const validCount =
    Number(result.invoice_count || 0) > 0;

  const valid =
    result.status === 'success' &&
    validPdf &&
    validTotal &&
    validCount;

  const output = {
    status: valid ? 'PASS' : 'CHECK_REQUIRED',
    read_only: true,
    duration_ms: Date.now() - started,
    kode_pelanggan: result.kode_pelanggan,
    nama_pelanggan: result.nama_pelanggan,
    invoice_count: result.invoice_count,
    total_outstanding: result.total_outstanding,
    calculated_total: result.calculated_total,
    validation_difference: result.validation_difference,
    filename: result.filename,
    mime_type: result.mime_type,
    size_bytes: result.size_bytes,
    base64_length:
      String(result.pdf_base64 || '').length,
    validation_pdf: validPdf,
    validation_total: validTotal,
    validation_count: validCount,
    validation: valid
  };

  Logger.log(
    '=== HASIL TB NUSANTARA - TAHAP 6D ==='
  );
  Logger.log(
    JSON.stringify(output, null, 2)
  );

  if (!valid) {
    throw new Error(
      'VALIDASI PDF STAGE 6D GAGAL: ' +
      JSON.stringify(output)
    );
  }

  return output;
}

/**
 * ============================================================
 * TB NUSANTARA - PDF PIUTANG TERPADU
 * ============================================================
 *
 * SINGLE SOURCE OF TRUTH untuk modul PDF piutang:
 *   - Stage 6D.1 - Semua Detail Piutang
 *   - Stage 6D.2 - Laporan Detail Piutang
 *
 * Struktur final:
 *   1. Stage 6D.1 V2 sebagai implementasi canonical.
 *   2. Stage 6D.2 menggunakan helper nota 6D.1 yang sama.
 *   3. Implementasi FINAL lama tidak digabung karena menduplikasi
 *      global function dan berpotensi menyebabkan collision/crash.
 *
 * ATURAN YANG DIPERTAHANKAN:
 *   - READ-ONLY terhadap data SID.
 *   - penjualan.piutang = saldo hutang aktual.
 *   - jumlah invoice dibandingkan dengan SUM itempenjualan.subtotal.
 *   - V2: mismatch header/item menjadi WARNING, bukan fatal.
 *   - Cross-check total outstanding tetap strict.
 *
 * PERBAIKAN AMAN:
 *   - Satu set helper 6D.1 saja.
 *   - 6D.2 tidak lagi melakukan setContentType('text/html') sebelum
 *     konversi PDF; langsung konversi Blob HTML ke PDF seperti 6D.1.
 *   - PDF bytes divalidasi sebelum dikirim ke API agar PDF terpotong
 *     tidak dianggap sukses.
 * ============================================================
 */

/**
 * ============================================================
 * TAHAP 6D.1 - PDF SEMUA DETAIL PIUTANG
 * ============================================================
 *
 * VERSI PERBAIKAN 6D
 *
 * File terpisah untuk pengujian.
 * TIDAK mengganti atau menghapus Stage 6D lama.
 *
 * READ-ONLY.
 *
 * PERBEDAAN UTAMA DENGAN 6D:
 *
 * Stage 6D lama memanggil getNotaTransaksi(), yang memiliki
 * validasi:
 *
 *   piutang = jumlah - bayar - angsuran
 *
 * Diagnostic membuktikan bahwa pada data historis tertentu
 * nilai penjualan.piutang dapat berbeda dari formula tersebut.
 *
 * Stage 6D.1 menggunakan:
 *
 *   penjualan.piutang
 *
 * sebagai SALDO HUTANG AKTUAL.
 *
 * Validasi yang tetap dilakukan:
 *
 *   penjualan.jumlah = SUM(itempenjualan.subtotal)
 *
 * dan:
 *
 *   SUM saldo piutang seluruh invoice
 *   = total outstanding ringkasan pelanggan
 *
 * ============================================================
 */


/**
 * ------------------------------------------------------------
 * 6D.1 HELPER
 * ------------------------------------------------------------
 */

function stage6d1EscapeHtml_(value) {
  return String(
    value === null || value === undefined ? '' : value
  )
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function stage6d1FormatRupiah_(value) {
  return 'Rp' + Number(value || 0)
    .toLocaleString('id-ID');
}


function stage6d1FormatNumber_(value) {
  const n = Number(value || 0);

  if (!isFinite(n)) return '0';

  return n.toLocaleString('id-ID', {
    maximumFractionDigits: 2
  });
}


function stage6d1FormatDate_(value) {
  if (!value) return '';

  const date = parseSidDate(value);

  if (!date) return String(value);

  return String(date.getDate()).padStart(2, '0') + '/' +
    String(date.getMonth() + 1).padStart(2, '0') + '/' +
    date.getFullYear();
}


function stage6d1BuildAddress_(header) {
  const parts = [
    header.alamat_pelanggan,
    header.alamat_pelanggan2,
    header.alamat_pelanggan3
  ];

  const cleaned = [];

  parts.forEach(function(part) {
    const value = String(part || '').trim();

    if (value && cleaned.indexOf(value) === -1) {
      cleaned.push(value);
    }
  });

  return cleaned.join(', ');
}


/**
 * ------------------------------------------------------------
 * 6D.1 - GET NOTA KHUSUS UNTUK PDF PIUTANG
 * ------------------------------------------------------------
 *
 * Tidak memanggil getNotaTransaksi().
 *
 * Sumber saldo hutang:
 *   penjualan.piutang
 *
 * Validasi item:
 *   jumlah = SUM(itempenjualan.subtotal)
 */
function getNotaTransaksiUntukPiutangPdf(kodeTransaksi) {
  const kode =
    validateStage6TransactionCode_(kodeTransaksi);

  const started = Date.now();

  const escapedKode =
    kode.replace(/'/g, "''");

  /*
   * HEADER
   */
  const headerQuery =
    'SELECT kode,tanggal,pelanggan,nama_pelanggan,' +
    'alamat_pelanggan,alamat_pelanggan2,' +
    'alamat_pelanggan3,alamat_pengiriman,' +
    'telp_pelanggan,jt,jumlah,bayar,angsuran,piutang ' +
    'FROM penjualan ' +
    "WHERE kode = '" + escapedKode + "' " +
    'LIMIT 1';

  const headerResult =
    sidRetailQuery(headerQuery);

  if (!headerResult ||
      headerResult.status !== 'success') {
    throw new Error(
      'Gagal mengambil header nota ' + kode + ': ' +
      JSON.stringify(headerResult)
    );
  }

  const headerRows =
    Array.isArray(headerResult.data)
      ? headerResult.data
      : [];

  if (!headerRows.length) {
    throw new Error(
      'Nota tidak ditemukan: ' + kode
    );
  }

  const row = headerRows[0];

  /*
   * ITEM
   */
  const itemQuery =
    'SELECT nourut,kode,kode_barang,nama_barang,' +
    'satuan,qty,harga,diskon,diskon_rupiah,subtotal ' +
    'FROM itempenjualan ' +
    "WHERE kode = '" + escapedKode + "' " +
    'LIMIT 501';

  const itemResult =
    sidRetailQuery(itemQuery);

  if (!itemResult ||
      itemResult.status !== 'success') {
    throw new Error(
      'Gagal mengambil item nota ' + kode + ': ' +
      JSON.stringify(itemResult)
    );
  }

  const itemRows =
    Array.isArray(itemResult.data)
      ? itemResult.data
      : [];

  if (itemRows.length > 500) {
    throw new Error(
      'Nota ' + kode +
      ' memiliki lebih dari 500 item. ' +
      'PDF dibatalkan untuk keamanan.'
    );
  }

  /*
   * VALIDASI TOTAL ITEM
   *
   * Ini tetap strict karena diagnostic membuktikan
   * jumlah invoice cocok dengan SUM subtotal item.
   */
  const jumlah =
    parseMoney(row.jumlah);

  const bayar =
    parseMoney(row.bayar);

  const angsuran =
    parseMoney(row.angsuran);

  const piutang =
    parseMoney(row.piutang);

  let totalItem = 0;

  const items =
    itemRows.map(function(item, index) {
      const subtotal =
        parseMoney(item.subtotal);

      totalItem += subtotal;

      return {
        no: index + 1,
        nourut: item.nourut || index + 1,
        kode_barang: item.kode_barang || '',
        nama_barang: item.nama_barang || '',
        satuan: item.satuan || '',
        qty: parseMoney(item.qty),
        harga: parseMoney(item.harga),
        diskon: parseMoney(item.diskon),
        diskon_rupiah: parseMoney(item.diskon_rupiah),
        subtotal: subtotal
      };
    });

  const selisihJumlah =
    jumlah - totalItem;

  // V2: mismatch header vs item tidak lagi memblokir PDF.
  // Total invoice tetap menggunakan penjualan.jumlah.
  // Detail item tetap menggunakan itempenjualan.subtotal.
  const jumlahItemMatch =
    Math.abs(selisihJumlah) <= 0.01;

  if (!jumlahItemMatch) {
    Logger.log(
      'WARNING 6D.1 V2: jumlah header berbeda dengan ' +
      'SUM item untuk ' + kode +
      '. jumlah=' + jumlah +
      ', sum_item=' + totalItem +
      ', selisih=' + selisihJumlah
    );
  }

  /*
   * JATUH TEMPO
   */
  const tanggalTransaksi =
    parseSidDate(row.tanggal);

  const jtHari =
    parseJtDays(row.jt);

  const jatuhTempo =
    tanggalTransaksi && jtHari !== null
      ? addDays(tanggalTransaksi, jtHari)
      : null;

  const result = {
    status: 'success',

    kode_transaksi:
      String(row.kode || kode).trim(),

    header: {
      kode_transaksi:
        String(row.kode || kode).trim(),

      tanggal:
        row.tanggal || '',

      jatuh_tempo:
        formatSidDate(jatuhTempo),

      jt_hari:
        jtHari,

      kode_pelanggan:
        row.pelanggan || '',

      nama_pelanggan:
        row.nama_pelanggan || '',

      alamat_pelanggan:
        row.alamat_pelanggan || '',

      alamat_pelanggan2:
        row.alamat_pelanggan2 || '',

      alamat_pelanggan3:
        row.alamat_pelanggan3 || '',

      alamat_pengiriman:
        row.alamat_pengiriman || '',

      telp_pelanggan:
        row.telp_pelanggan || ''
    },

    items: items,

    summary: {
      jumlah: jumlah,
      bayar: bayar,
      angsuran: angsuran,

      /*
       * PENTING:
       * Saldo hutang berasal langsung dari
       * penjualan.piutang.
       */
      piutang: piutang
    },

    validation: {
      jumlah_item: jumlahItemMatch,
      jumlah: jumlah,
      sum_item_subtotal: totalItem,
      selisih_jumlah_item: selisihJumlah,
      jumlah_item_warning: !jumlahItemMatch,

      /*
       * Formula piutang sengaja TIDAK dipaksakan.
       */
      piutang_source: 'penjualan.piutang'
    },

    duration_ms:
      Date.now() - started
  };

  return result;
}


/**
 * ------------------------------------------------------------
 * 6D.1 - SEMUA NOTA OUTSTANDING
 * ------------------------------------------------------------
 */
function getSemuaNotaOutstanding_6D1(kodePelanggan) {
  const kode =
    validateStage6CustomerCode_(kodePelanggan);

  const started = Date.now();

  /*
   * Gunakan ringkasan 6A sebagai daftar invoice dan
   * sumber total outstanding.
   */
  const ringkasan =
    getRingkasanPiutangPelanggan(kode);

  const invoices = [];

  ringkasan.data.forEach(function(row, index) {
    const kodeTransaksi =
      validateStage6TransactionCode_(
        row.kode_transaksi
      );

    Logger.log(
      'STAGE 6D.1 DETAIL ' +
      (index + 1) + '/' +
      ringkasan.data.length +
      ' | KODE=' + kodeTransaksi
    );

    const nota =
      getNotaTransaksiUntukPiutangPdf(
        kodeTransaksi
      );

    if (!nota || nota.status !== 'success') {
      throw new Error(
        'Gagal mengambil nota 6D.1: ' +
        kodeTransaksi
      );
    }

    /*
     * PDF PIUTANG hanya menerima invoice yang
     * masih outstanding berdasarkan field aktual.
     */
    if (Number(nota.summary.piutang) <= 0) {
      throw new Error(
        'Invoice ' + kodeTransaksi +
        ' tidak memiliki saldo piutang outstanding.'
      );
    }

    invoices.push(nota);
  });

  /*
   * TOTAL DARI DETAIL INVOICE
   */
  let totalOutstanding = 0;

  invoices.forEach(function(nota) {
    totalOutstanding +=
      Number(nota.summary.piutang || 0);
  });

  /*
   * CROSS-CHECK DENGAN RINGKASAN 6A
   */
  const ringkasanTotal =
    Number(ringkasan.total_outstanding || 0);

  const selisih =
    totalOutstanding - ringkasanTotal;

  if (Math.abs(selisih) > 0.01) {
    throw new Error(
      'Validasi total outstanding 6D.1 gagal. ' +
      'Ringkasan=' + ringkasanTotal +
      ', detail=' + totalOutstanding +
      ', selisih=' + selisih
    );
  }

  const jumlahItemMismatchCount =
    invoices.filter(function(nota) {
      return nota &&
        nota.validation &&
        nota.validation.jumlah_item === false;
    }).length;

  return {
    status: 'success',
    generated_at:
      new Date().toISOString(),

    kode_pelanggan:
      kode,

    nama_pelanggan:
      ringkasan.nama_pelanggan,

    telp:
      ringkasan.telp,

    alamat:
      ringkasan.alamat,

    count:
      invoices.length,

    total_outstanding:
      totalOutstanding,

    jumlah_item_mismatch_count:
      jumlahItemMismatchCount,

    ringkasan:
      ringkasan.data,

    invoices:
      invoices,

    validation: {
      ringkasan_total:
        ringkasanTotal,

      detail_total:
        totalOutstanding,

      difference:
        selisih
    },

    duration_ms:
      Date.now() - started
  };
}


/**
 * ------------------------------------------------------------
 * 6D.1 - HTML PDF
 * ------------------------------------------------------------
 */
function stage6d1BuildInvoiceHtml_(nota, invoiceIndex) {
  const header =
    nota.header || {};

  const summary =
    nota.summary || {};

  const items =
    Array.isArray(nota.items)
      ? nota.items
      : [];

  let itemRows = '';

  items.forEach(function(item, index) {
    itemRows +=
      '<tr>' +
        '<td class="center">' +
          stage6d1EscapeHtml_(
            item.no || index + 1
          ) +
        '</td>' +

        '<td>' +
          stage6d1EscapeHtml_(
            item.kode_barang || ''
          ) +
        '</td>' +

        '<td>' +
          stage6d1EscapeHtml_(
            item.nama_barang || ''
          ) +
        '</td>' +

        '<td class="center">' +
          stage6d1EscapeHtml_(
            item.satuan || ''
          ) +
        '</td>' +

        '<td class="number">' +
          stage6d1EscapeHtml_(
            stage6d1FormatNumber_(item.qty)
          ) +
        '</td>' +

        '<td class="money">' +
          stage6d1EscapeHtml_(
            stage6d1FormatRupiah_(item.harga)
          ) +
        '</td>' +

        '<td class="money">' +
          stage6d1EscapeHtml_(
            stage6d1FormatRupiah_(
              item.diskon_rupiah
            )
          ) +
        '</td>' +

        '<td class="money">' +
          stage6d1EscapeHtml_(
            stage6d1FormatRupiah_(
              item.subtotal
            )
          ) +
        '</td>' +
      '</tr>';
  });

  if (!itemRows) {
    itemRows =
      '<tr>' +
        '<td colspan="8" class="empty">' +
          'Tidak ada item transaksi.' +
        '</td>' +
      '</tr>';
  }

  const alamat =
    stage6d1BuildAddress_(header);

  return (
    '<section class="invoice">' +

      '<div class="invoice-top">' +
        '<div>' +
          '<div class="company">TB NUSANTARA</div>' +
          '<div class="legal">' +
            'CV NUSANTARA BUILDING MATERIAL' +
          '</div>' +
          '<div class="company-detail">' +
            'JL. LINTAS SELATAN SUROREJAN PURING<br>' +
            '081234563843' +
          '</div>' +
        '</div>' +

        '<div class="document-number">' +
          '<div class="small-label">NOTA</div>' +
          '<div class="invoice-code">' +
            stage6d1EscapeHtml_(
              header.kode_transaksi || ''
            ) +
          '</div>' +
          '<div class="small-label">' +
            'Invoice ' + (invoiceIndex + 1) +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="meta-grid">' +

        '<div>' +
          '<table class="meta-table">' +

            '<tr>' +
              '<td class="label">Tanggal</td>' +
              '<td class="sep">:</td>' +
              '<td>' +
                stage6d1EscapeHtml_(
                  stage6d1FormatDate_(
                    header.tanggal
                  )
                ) +
              '</td>' +
            '</tr>' +

            '<tr>' +
              '<td class="label">Jatuh Tempo</td>' +
              '<td class="sep">:</td>' +
              '<td>' +
                stage6d1EscapeHtml_(
                  stage6d1FormatDate_(
                    header.jatuh_tempo
                  )
                ) +
              '</td>' +
            '</tr>' +

          '</table>' +
        '</div>' +

        '<div>' +
          '<table class="meta-table">' +

            '<tr>' +
              '<td class="label">Pelanggan</td>' +
              '<td class="sep">:</td>' +
              '<td>' +
                stage6d1EscapeHtml_(
                  header.nama_pelanggan || ''
                ) +
              '</td>' +
            '</tr>' +

            '<tr>' +
              '<td class="label">Kode</td>' +
              '<td class="sep">:</td>' +
              '<td>' +
                stage6d1EscapeHtml_(
                  header.kode_pelanggan || ''
                ) +
              '</td>' +
            '</tr>' +

          '</table>' +
        '</div>' +

      '</div>' +

      '<div class="address">' +
        '<strong>Alamat:</strong> ' +
        stage6d1EscapeHtml_(alamat) +
      '</div>' +

      '<table class="items">' +
        '<thead>' +
          '<tr>' +
            '<th>No</th>' +
            '<th>Kode Barang</th>' +
            '<th>Nama Barang</th>' +
            '<th>Satuan</th>' +
            '<th>Qty</th>' +
            '<th>Harga</th>' +
            '<th>Diskon</th>' +
            '<th>Subtotal</th>' +
          '</tr>' +
        '</thead>' +

        '<tbody>' +
          itemRows +
        '</tbody>' +
      '</table>' +

      '<table class="summary">' +
        '<tr>' +
          '<td class="summary-spacer"></td>' +

          '<td class="summary-box">' +
            '<table>' +

              '<tr>' +
                '<td class="label">TOTAL INVOICE</td>' +
                '<td class="value">' +
                  stage6d1EscapeHtml_(
                    stage6d1FormatRupiah_(
                      summary.jumlah
                    )
                  ) +
                '</td>' +
              '</tr>' +

              '<tr>' +
                '<td class="label">BAYAR</td>' +
                '<td class="value">' +
                  stage6d1EscapeHtml_(
                    stage6d1FormatRupiah_(
                      summary.bayar
                    )
                  ) +
                '</td>' +
              '</tr>' +

              '<tr>' +
                '<td class="label">ANGSURAN</td>' +
                '<td class="value">' +
                  stage6d1EscapeHtml_(
                    stage6d1FormatRupiah_(
                      summary.angsuran
                    )
                  ) +
                '</td>' +
              '</tr>' +

              '<tr class="balance">' +
                '<td class="label">SALDO HUTANG</td>' +
                '<td class="value">' +
                  stage6d1EscapeHtml_(
                    stage6d1FormatRupiah_(
                      summary.piutang
                    )
                  ) +
                '</td>' +
              '</tr>' +

            '</table>' +
          '</td>' +
        '</tr>' +
      '</table>' +

    '</section>'
  );
}


function buildSemuaDetailPiutangPdfHtml_6D1(data) {
  if (!data ||
      data.status !== 'success') {
    throw new Error(
      'Data PDF 6D.1 tidak valid.'
    );
  }

  const invoices =
    Array.isArray(data.invoices)
      ? data.invoices
      : [];

  let invoiceSections = '';

  invoices.forEach(function(nota, index) {
    invoiceSections +=
      stage6d1BuildInvoiceHtml_(
        nota,
        index
      );
  });

  if (!invoiceSections) {
    invoiceSections =
      '<div class="empty-document">' +
        'Tidak ada invoice outstanding.' +
      '</div>';
  }

  const generatedDate =
    formatSidDate(new Date());

  return '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
      '<meta charset="UTF-8">' +

      '<style>' +

        '@page {' +
          'size: A4 portrait;' +
          'margin: 11mm 10mm 12mm 10mm;' +
        '}' +

        'html, body {' +
          'margin: 0;' +
          'padding: 0;' +
          'font-family: Arial, Helvetica, sans-serif;' +
          'font-size: 8pt;' +
          'color: #111827;' +
        '}' +

        '.cover {' +
          'page-break-after: always;' +
          'padding-top: 45mm;' +
          'text-align: center;' +
        '}' +

        '.cover-company {' +
          'font-size: 21pt;' +
          'font-weight: 700;' +
        '}' +

        '.cover-legal {' +
          'font-size: 11pt;' +
          'font-weight: 700;' +
          'margin-top: 4px;' +
        '}' +

        '.cover-title {' +
          'font-size: 17pt;' +
          'font-weight: 700;' +
          'margin-top: 45mm;' +
          'letter-spacing: .5px;' +
        '}' +

        '.cover-customer {' +
          'font-size: 12pt;' +
          'margin-top: 12px;' +
        '}' +

        '.cover-total {' +
          'font-size: 16pt;' +
          'font-weight: 700;' +
          'margin-top: 18px;' +
        '}' +

        '.cover-date {' +
          'font-size: 8pt;' +
          'color: #6b7280;' +
          'margin-top: 20px;' +
        '}' +

        '.invoice {' +
          'page-break-before: always;' +
        '}' +

        '.invoice:first-of-type {' +
          'page-break-before: auto;' +
        '}' +

        '.invoice-top {' +
          'display: table;' +
          'width: 100%;' +
          'border-bottom: 2px solid #111827;' +
          'padding-bottom: 6px;' +
          'margin-bottom: 9px;' +
        '}' +

        '.invoice-top > div {' +
          'display: table-cell;' +
          'vertical-align: top;' +
        '}' +

        '.document-number {' +
          'text-align: right;' +
          'width: 35%;' +
        '}' +

        '.company {' +
          'font-size: 14pt;' +
          'font-weight: 700;' +
        '}' +

        '.legal {' +
          'font-size: 8.5pt;' +
          'font-weight: 700;' +
          'margin-top: 2px;' +
        '}' +

        '.company-detail {' +
          'font-size: 7.5pt;' +
          'line-height: 1.35;' +
          'margin-top: 2px;' +
        '}' +

        '.small-label {' +
          'font-size: 7pt;' +
          'color: #6b7280;' +
        '}' +

        '.invoice-code {' +
          'font-size: 12pt;' +
          'font-weight: 700;' +
          'margin: 2px 0;' +
        '}' +

        '.meta-grid {' +
          'display: table;' +
          'width: 100%;' +
          'margin-bottom: 5px;' +
        '}' +

        '.meta-grid > div {' +
          'display: table-cell;' +
          'width: 50%;' +
          'vertical-align: top;' +
        '}' +

        '.meta-table {' +
          'width: 100%;' +
          'border-collapse: collapse;' +
        '}' +

        '.meta-table td {' +
          'padding: 2px 0;' +
          'vertical-align: top;' +
        '}' +

        '.meta-table .label {' +
          'font-weight: 700;' +
          'width: 24mm;' +
        '}' +

        '.meta-table .sep {' +
          'width: 3mm;' +
          'text-align: center;' +
        '}' +

        '.address {' +
          'border: 1px solid #d1d5db;' +
          'padding: 5px;' +
          'margin-bottom: 7px;' +
          'min-height: 10px;' +
        '}' +

        '.items {' +
          'width: 100%;' +
          'border-collapse: collapse;' +
          'table-layout: fixed;' +
          'font-size: 7pt;' +
        '}' +

        '.items thead {' +
          'display: table-header-group;' +
        '}' +

        '.items th {' +
          'background: #111827;' +
          'color: #ffffff;' +
          'border: 1px solid #111827;' +
          'padding: 4px 2px;' +
          'text-align: center;' +
        '}' +

        '.items td {' +
          'border: 1px solid #9ca3af;' +
          'padding: 3px 2px;' +
          'vertical-align: middle;' +
          'word-wrap: break-word;' +
        '}' +

        '.items th:nth-child(1), .items td:nth-child(1) {' +
          'width: 5%;' +
        '}' +

        '.items th:nth-child(2), .items td:nth-child(2) {' +
          'width: 13%;' +
        '}' +

        '.items th:nth-child(3), .items td:nth-child(3) {' +
          'width: 25%;' +
        '}' +

        '.items th:nth-child(4), .items td:nth-child(4) {' +
          'width: 7%;' +
        '}' +

        '.items th:nth-child(5), .items td:nth-child(5) {' +
          'width: 8%;' +
        '}' +

        '.items th:nth-child(6), .items td:nth-child(6) {' +
          'width: 14%;' +
        '}' +

        '.items th:nth-child(7), .items td:nth-child(7) {' +
          'width: 10%;' +
        '}' +

        '.items th:nth-child(8), .items td:nth-child(8) {' +
          'width: 18%;' +
        '}' +

        '.center {' +
          'text-align: center;' +
        '}' +

        '.number {' +
          'text-align: right;' +
          'white-space: nowrap;' +
        '}' +

        '.money {' +
          'text-align: right;' +
          'white-space: nowrap;' +
        '}' +

        '.summary {' +
          'width: 100%;' +
          'border-collapse: collapse;' +
          'margin-top: 7px;' +
        '}' +

        '.summary-spacer {' +
          'width: 58%;' +
        '}' +

        '.summary-box {' +
          'width: 42%;' +
        '}' +

        '.summary-box table {' +
          'width: 100%;' +
          'border-collapse: collapse;' +
        '}' +

        '.summary-box td {' +
          'border: 1px solid #9ca3af;' +
          'padding: 4px;' +
        '}' +

        '.summary-box .label {' +
          'font-weight: 700;' +
        '}' +

        '.summary-box .value {' +
          'text-align: right;' +
          'white-space: nowrap;' +
        '}' +

        '.summary-box .balance td {' +
          'border: 1.5px solid #111827;' +
          'font-weight: 700;' +
        '}' +

        '.empty, .empty-document {' +
          'text-align: center;' +
          'padding: 20px;' +
        '}' +

        '.final-summary {' +
          'page-break-before: always;' +
          'padding-top: 20mm;' +
        '}' +

        '.final-summary h2 {' +
          'text-align: center;' +
          'font-size: 15pt;' +
          'margin-bottom: 18px;' +
        '}' +

        '.final-box {' +
          'width: 70%;' +
          'margin: 0 auto;' +
          'border-collapse: collapse;' +
        '}' +

        '.final-box td {' +
          'border: 1px solid #9ca3af;' +
          'padding: 8px;' +
        '}' +

        '.final-box .value {' +
          'text-align: right;' +
          'white-space: nowrap;' +
        '}' +

        '.final-box .total td {' +
          'border: 2px solid #111827;' +
          'font-size: 12pt;' +
          'font-weight: 700;' +
        '}' +

        '.footer-note {' +
          'text-align: center;' +
          'font-size: 7pt;' +
          'color: #6b7280;' +
          'margin-top: 25px;' +
        '}' +

      '</style>' +
    '</head>' +

    '<body>' +

      '<section class="cover">' +
        '<div class="cover-company">' +
          'TB NUSANTARA' +
        '</div>' +

        '<div class="cover-legal">' +
          'CV NUSANTARA BUILDING MATERIAL' +
        '</div>' +

        '<div>' +
          'JL. LINTAS SELATAN SUROREJAN PURING<br>' +
          '081234563843' +
        '</div>' +

        '<div class="cover-title">' +
          'SEMUA DETAIL PIUTANG' +
        '</div>' +

        '<div class="cover-customer">' +
          '<strong>' +
            stage6d1EscapeHtml_(
              data.nama_pelanggan || ''
            ) +
          '</strong><br>' +

          'Kode: ' +
          stage6d1EscapeHtml_(
            data.kode_pelanggan || ''
          ) +
        '</div>' +

        '<div class="cover-total">' +
          stage6d1EscapeHtml_(
            stage6d1FormatRupiah_(
              data.total_outstanding
            )
          ) +
        '</div>' +

        '<div class="cover-date">' +
          'Tanggal: ' +
          stage6d1EscapeHtml_(
            stage6d1FormatDate_(
              generatedDate
            )
          ) +
        '</div>' +
      '</section>' +

      invoiceSections +

      '<section class="final-summary">' +
        '<h2>RINGKASAN TOTAL PIUTANG</h2>' +

        '<table class="final-box">' +

          '<tr>' +
            '<td>Pelanggan</td>' +
            '<td class="value">' +
              stage6d1EscapeHtml_(
                data.nama_pelanggan || ''
              ) +
            '</td>' +
          '</tr>' +

          '<tr>' +
            '<td>Kode Pelanggan</td>' +
            '<td class="value">' +
              stage6d1EscapeHtml_(
                data.kode_pelanggan || ''
              ) +
            '</td>' +
          '</tr>' +

          '<tr>' +
            '<td>Jumlah Invoice</td>' +
            '<td class="value">' +
              stage6d1EscapeHtml_(
                data.count || 0
              ) +
            '</td>' +
          '</tr>' +

          '<tr class="total">' +
            '<td>TOTAL OUTSTANDING</td>' +
            '<td class="value">' +
              stage6d1EscapeHtml_(
                stage6d1FormatRupiah_(
                  data.total_outstanding
                )
              ) +
            '</td>' +
          '</tr>' +

        '</table>' +

        '<div class="footer-note">' +
          'Dokumen ini dibuat berdasarkan data ' +
          'outstanding TB Nusantara dan bersifat READ-ONLY.' +
        '</div>' +

      '</section>' +

    '</body>' +
    '</html>';
}


/**
 * ------------------------------------------------------------
 * 6D.1 - GENERATE PDF
 * ------------------------------------------------------------
 */
function getPdfSemuaDetailPiutang_6D1(kodePelanggan) {
  const kode =
    validateStage6CustomerCode_(kodePelanggan);

  const started = Date.now();

  const data =
    getSemuaNotaOutstanding_6D1(kode);

  if (!data ||
      data.status !== 'success') {
    throw new Error(
      'Gagal mengambil semua detail piutang 6D.1.'
    );
  }

  const calculatedTotal =
    data.invoices.reduce(
      function(total, nota) {
        return total +
          Number(
            nota.summary.piutang || 0
          );
      },
      0
    );

  const expectedTotal =
    Number(data.total_outstanding || 0);

  const difference =
    calculatedTotal - expectedTotal;

  if (Math.abs(difference) > 0.01) {
    throw new Error(
      'Validasi total PDF 6D.1 gagal. ' +
      'Expected=' + expectedTotal +
      ', calculated=' + calculatedTotal
    );
  }

  const html =
    buildSemuaDetailPiutangPdfHtml_6D1(
      data
    );

  const htmlOutput =
    HtmlService
      .createHtmlOutput(html)
      .setWidth(794)
      .setHeight(1123);

  const pdfBlob =
    htmlOutput
      .getBlob()
      .getAs(MimeType.PDF);

  const bytes =
    pdfBlob.getBytes();

  validateGeneratedPdfBytes_(
    bytes,
    'PDF 6D.1'
  );

  const safeKode =
    String(
      data.kode_pelanggan || kode
    ).replace(
      /[^a-zA-Z0-9._-]+/g,
      '_'
    );

  const filename =
    'Semua_Detail_Piutang_6D1_' +
    safeKode +
    '.pdf';

  pdfBlob.setName(filename);

  const result = {
    status: 'success',
    filename: filename,
    mime_type:
      pdfBlob.getContentType(),

    size_bytes:
      bytes.length,

    kode_pelanggan:
      data.kode_pelanggan,

    nama_pelanggan:
      data.nama_pelanggan,

    invoice_count:
      data.count,

    total_outstanding:
      data.total_outstanding,

    calculated_total:
      calculatedTotal,

    validation_difference:
      difference,

    pdf_base64:
      Utilities.base64Encode(bytes),

    duration_ms:
      Date.now() - started
  };

  Logger.log(
    '=============================================='
  );

  Logger.log(
    'TB NUSANTARA - TAHAP 6D.1'
  );

  Logger.log(
    'PDF SEMUA DETAIL PIUTANG'
  );

  Logger.log(
    '=============================================='
  );

  Logger.log(
    'PELANGGAN        : ' +
    result.nama_pelanggan
  );

  Logger.log(
    'KODE             : ' +
    result.kode_pelanggan
  );

  Logger.log(
    'JUMLAH INVOICE   : ' +
    result.invoice_count
  );

  Logger.log(
    'TOTAL OUTSTANDING: Rp ' +
    Number(
      result.total_outstanding
    ).toLocaleString('id-ID')
  );

  Logger.log(
    'TOTAL CALCULATED : Rp ' +
    Number(
      result.calculated_total
    ).toLocaleString('id-ID')
  );

  Logger.log(
    'SELISIH          : Rp ' +
    Number(
      result.validation_difference
    ).toLocaleString('id-ID')
  );

  Logger.log(
    'PDF SIZE         : ' +
    result.size_bytes +
    ' bytes'
  );

  Logger.log(
    'MIME TYPE        : ' +
    result.mime_type
  );

  Logger.log(
    'DURASI           : ' +
    (result.duration_ms / 1000).toFixed(3) +
    ' detik'
  );

  Logger.log(
    '=============================================='
  );

  return result;
}


/**
 * ------------------------------------------------------------
 * TEST 6D.1
 * ------------------------------------------------------------
 *
 * Menggunakan pelanggan dari transaksi outstanding pertama.
 *
 * Target data yang sebelumnya sudah tervalidasi:
 *
 *   Kode       : 2102029
 *   Pelanggan  : PAK PAING
 *   Invoice    : 11
 *   Total      : Rp2.983.000
 *
 * Test ini READ-ONLY.
 */
function testStage6D1() {
  const started = Date.now();

  Logger.log(
    '=============================================='
  );

  Logger.log(
    'TB NUSANTARA - TAHAP 6D.1'
  );

  Logger.log(
    'TEST PDF SEMUA DETAIL'
  );

  Logger.log(
    'READ-ONLY'
  );

  Logger.log(
    '=============================================='
  );

  const sampleQuery =
    'SELECT kode,pelanggan,nama_pelanggan,piutang ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ' +
    'ORDER BY kode LIMIT 1';

  const sampleResult =
    sidRetailQuery(sampleQuery);

  if (!sampleResult ||
      sampleResult.status !== 'success') {
    throw new Error(
      'Gagal mengambil transaksi sample: ' +
      JSON.stringify(sampleResult)
    );
  }

  const rows =
    Array.isArray(sampleResult.data)
      ? sampleResult.data
      : [];

  if (!rows.length) {
    throw new Error(
      'Tidak ada transaksi outstanding ' +
      'untuk test 6D.1.'
    );
  }

  const kodePelanggan =
    String(
      rows[0].pelanggan || ''
    ).trim();

  if (!kodePelanggan) {
    throw new Error(
      'Sample transaksi tidak memiliki ' +
      'kode pelanggan.'
    );
  }

  Logger.log(
    'SAMPLE PELANGGAN: ' +
    kodePelanggan
  );

  const result =
    getPdfSemuaDetailPiutang_6D1(
      kodePelanggan
    );

  const validPdf =
    String(
      result.mime_type || ''
    ).toLowerCase() ===
      'application/pdf' &&

    Number(
      result.size_bytes || 0
    ) > 0 &&

    String(
      result.pdf_base64 || ''
    ).length > 0;

  const validTotal =
    Math.abs(
      Number(
        result.total_outstanding || 0
      ) -
      Number(
        result.calculated_total || 0
      )
    ) <= 0.01 &&

    Math.abs(
      Number(
        result.validation_difference || 0
      )
    ) <= 0.01;

  const validCount =
    Number(
      result.invoice_count || 0
    ) > 0;

  const valid =
    result.status === 'success' &&
    validPdf &&
    validTotal &&
    validCount;

  const output = {
    status:
      valid
        ? 'PASS'
        : 'CHECK_REQUIRED',

    read_only: true,

    duration_ms:
      Date.now() - started,

    kode_pelanggan:
      result.kode_pelanggan,

    nama_pelanggan:
      result.nama_pelanggan,

    invoice_count:
      result.invoice_count,

    total_outstanding:
      result.total_outstanding,

    calculated_total:
      result.calculated_total,

    validation_difference:
      result.validation_difference,

    filename:
      result.filename,

    mime_type:
      result.mime_type,

    size_bytes:
      result.size_bytes,

    base64_length:
      String(
        result.pdf_base64 || ''
      ).length,

    validation_pdf:
      validPdf,

    validation_total:
      validTotal,

    validation_count:
      validCount,

    validation:
      valid
  };

  Logger.log(
    '=== HASIL TB NUSANTARA - TAHAP 6D.1 ==='
  );

  Logger.log(
    JSON.stringify(
      output,
      null,
      2
    )
  );

  if (!valid) {
    throw new Error(
      'VALIDASI PDF 6D.1 GAGAL: ' +
      JSON.stringify(output)
    );
  }

  return output;
}

/**
 * TEST 6D.1 V2 - NOTA MISMATCH
 *
 * Read-only.
 * Tujuan: memastikan nota yang memiliki selisih
 * header vs SUM item tetap dapat diproses menjadi PDF.
 *
 * Target:
 *   R43-090926060
 *   jumlah header   = Rp3.383.000
 *   SUM item        = Rp3.483.000
 *   selisih         = -Rp100.000
 */
function testStage6D1V2MismatchInvoice() {
  const kodeTransaksi = 'R43-090926060';

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - STAGE 6D.1 V2');
  Logger.log('TEST NOTA MISMATCH - READ ONLY');
  Logger.log('NOTA: ' + kodeTransaksi);
  Logger.log('==============================================');

  const started = Date.now();

  const nota = getNotaTransaksiUntukPiutangPdf(kodeTransaksi);

  const validStatus =
    nota &&
    nota.status === 'success';

  const validExpectedMismatch =
    validStatus &&
    Number(nota.summary.jumlah || 0) === 3383000 &&
    Number(nota.validation.sum_item_subtotal || 0) === 3483000 &&
    Math.abs(
      Number(nota.validation.selisih_jumlah_item || 0) + 100000
    ) <= 0.01 &&
    nota.validation.jumlah_item === false &&
    nota.validation.jumlah_item_warning === true;

  const validPiutang =
    validStatus &&
    Number(nota.summary.piutang || 0) === 3383000;

  const valid =
    validStatus &&
    validExpectedMismatch &&
    validPiutang;

  const output = {
    status: valid ? 'PASS' : 'CHECK_REQUIRED',
    read_only: true,
    kode_transaksi: kodeTransaksi,
    jumlah_header: validStatus ? nota.summary.jumlah : null,
    sum_item_subtotal: validStatus ?
      nota.validation.sum_item_subtotal : null,
    selisih_jumlah_item: validStatus ?
      nota.validation.selisih_jumlah_item : null,
    jumlah_item_match: validStatus ?
      nota.validation.jumlah_item : null,
    jumlah_item_warning: validStatus ?
      nota.validation.jumlah_item_warning : null,
    piutang: validStatus ?
      nota.summary.piutang : null,
    duration_ms: Date.now() - started,
    validation: valid
  };

  Logger.log(JSON.stringify(output, null, 2));

  if (!valid) {
    throw new Error(
      'VALIDASI STAGE 6D.1 V2 GAGAL: ' +
      JSON.stringify(output)
    );
  }

  Logger.log('VALIDATION STAGE 6D.1 V2 MISMATCH: PASS');

  return output;
}


/**
 * ------------------------------------------------------------
 * PDF COMMON VALIDATION
 * ------------------------------------------------------------
 * Validasi struktural ringan. Tidak mengubah isi PDF.
 */
function validateGeneratedPdfBytes_(bytes, label) {
  if (!bytes || !bytes.length) {
    throw new Error(label + ' gagal dibuat: ukuran 0 byte.');
  }

  // Utilities.newBlob(...).getBytes() menghasilkan array byte bertanda.
  // Konversi hanya untuk inspeksi teks pada bagian awal/akhir PDF.
  const headLength = Math.min(bytes.length, 16);
  let header = '';
  for (let i = 0; i < headLength; i++) {
    const value = Number(bytes[i]);
    header += String.fromCharCode(value < 0 ? value + 256 : value);
  }

  if (header.indexOf('%PDF-') !== 0) {
    throw new Error(
      label + ' tidak valid: header PDF (%PDF-) tidak ditemukan.'
    );
  }

  // Cukup inspeksi tail. PDF normal menempatkan startxref dan %%EOF
  // di bagian akhir file. Beri ruang agar komentar/whitespace akhir aman.
  const tailLength = Math.min(bytes.length, 4096);
  let tail = '';
  const start = bytes.length - tailLength;

  for (let i = start; i < bytes.length; i++) {
    const value = Number(bytes[i]);
    tail += String.fromCharCode(value < 0 ? value + 256 : value);
  }

  if (tail.indexOf('startxref') === -1) {
    throw new Error(
      label + ' tidak valid: startxref tidak ditemukan.'
    );
  }

  if (tail.lastIndexOf('%%EOF') === -1) {
    throw new Error(
      label + ' tidak valid: %%EOF tidak ditemukan.'
    );
  }

  return true;
}


/**
 * ------------------------------------------------------------
 * 6D.2 - PATCH GENERATOR
 * ------------------------------------------------------------
 * 6D.2 tetap menggunakan seluruh fungsi/data 6D.2 asli di bawah.
 * Hanya jalur konversi HTML -> PDF yang diselaraskan dengan 6D.1.
 */

/**
 * ============================================================
 * TAHAP 6D.2 - PDF LAPORAN DETAIL PIUTANG PELANGGAN
 * ============================================================
 *
 * Desain:
 * - A4 portrait.
 * - Header pelanggan hanya sekali.
 * - Setiap nota hanya 1 baris identitas: No, Kode, Tanggal,
 *   Jatuh Tempo, Umur.
 * - Header kolom barang hanya sekali.
 * - Semua detail barang menjadi satu tabel kontinu.
 * - Tidak ada total/bayar/angsuran per nota.
 * - Total finansial hanya sekali di bagian akhir.
 * - Area TTD di bagian ringkasan.
 * - Informasi pembayaran ditampilkan sekali di bagian akhir.
 * - Saldo hutang selalu menggunakan penjualan.piutang melalui
 *   jalur getNotaTransaksiUntukPiutangPdf() yang sudah divalidasi
 *   pada Stage 6D.1.
 *
 * Catatan:
 * File ini sengaja terpisah dari 6D.1. Jangan hapus 6D.1 selama
 * 6D.2 masih menggunakannya sebagai sumber data nota.
 * ============================================================
 */

function stage6d2EscapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stage6d2FormatRupiah_(value) {
  const number = Number(value || 0);
  if (!isFinite(number)) return 'Rp 0';
  return 'Rp ' + Math.round(number).toLocaleString('id-ID');
}

function stage6d2FormatNumber_(value) {
  const number = Number(value || 0);
  if (!isFinite(number)) return '0';
  return Math.round(number).toLocaleString('id-ID');
}

function stage6d2FormatDate_(value) {
  if (!value) return '-';
  const text = String(value).trim();
  if (!text) return '-';

  // Sudah DD/MM/YYYY.
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return text;

  // YYYY-MM-DD.
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[3] + '/' + match[2] + '/' + match[1];

  return text;
}

function stage6d2FormatAge_(umurHari) {
  if (umurHari === null || umurHari === undefined || !isFinite(Number(umurHari))) {
    return '-';
  }

  const umur = Number(umurHari);
  if (umur <= 0) return 'Belum JT';
  return Math.round(umur) + ' Hari';
}

function stage6d2BuildAddress_(nota, fallback) {
  const header = nota && nota.header ? nota.header : {};
  const parts = [
    header.alamat_pelanggan,
    header.alamat_pelanggan2,
    header.alamat_pelanggan3
  ].map(function(value) {
    return String(value || '').trim();
  }).filter(Boolean);

  if (parts.length) return parts.join(', ');
  return String(fallback || '').trim();
}

function stage6d2BuildNotaRowHtml_(nota, invoiceIndex) {
  const header = nota.header || {};
  const items = Array.isArray(nota.items) ? nota.items : [];
  const kode = header.kode_transaksi || '';
  const tanggal = stage6d2FormatDate_(header.tanggal);
  const jatuhTempo = stage6d2FormatDate_(header.jatuh_tempo);
  const umur = stage6d2FormatAge_(header.umur_hari);

  let html = '';

  html += '<tr class="nota-row">';
  html += '<td class="nota-no">' + stage6d2EscapeHtml_(String(invoiceIndex + 1).padStart(2, '0')) + '</td>';
  html += '<td class="nota-kode">' + stage6d2EscapeHtml_(kode) + '</td>';
  html += '<td>' + stage6d2EscapeHtml_(tanggal) + '</td>';
  html += '<td>' + stage6d2EscapeHtml_(jatuhTempo) + '</td>';
  html += '<td class="center">' + stage6d2EscapeHtml_(umur) + '</td>';
  html += '</tr>';

  items.forEach(function(item) {
    html += '<tr class="item-row">';
    html += '<td></td>';
    html += '<td class="item-code">' + stage6d2EscapeHtml_(item.kode_barang || '') + '</td>';
    html += '<td class="item-name">' + stage6d2EscapeHtml_(item.nama_barang || '') + '</td>';
    html += '<td class="center">' + stage6d2EscapeHtml_(item.satuan || '') + '</td>';
    html += '<td class="qty">' + stage6d2EscapeHtml_(stage6d2FormatNumber_(item.qty)) + '</td>';
    html += '<td class="money">' + stage6d2EscapeHtml_(stage6d2FormatNumber_(item.harga)) + '</td>';
    html += '<td class="money subtotal">' + stage6d2EscapeHtml_(stage6d2FormatNumber_(item.subtotal)) + '</td>';
    html += '</tr>';
  });

  return html;
}

function stage6d2BuildReportHtml_(data) {
  const generatedAt = new Date(data.generated_at || new Date());
  const tanggalCetak = stage6d2FormatDate_(
    Utilities.formatDate(generatedAt, Session.getScriptTimeZone(), 'yyyy-MM-dd')
  );

  const invoices = Array.isArray(data.invoices) ? data.invoices.slice() : [];

  // Laporan disusun berdasarkan tanggal nota agar periode dan urutan
  // dokumen mengikuti kronologi transaksi, bukan urutan kode nota.
  invoices.sort(function(a, b) {
    const da = a && a.header ? parseSidDate(a.header.tanggal) : null;
    const db = b && b.header ? parseSidDate(b.header.tanggal) : null;
    const ta = da ? da.getTime() : Number.MAX_SAFE_INTEGER;
    const tb = db ? db.getTime() : Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    return String(a && a.header ? a.header.kode_transaksi : '')
      .localeCompare(String(b && b.header ? b.header.kode_transaksi : ''));
  });

  let tanggalAwal = null;
  let tanggalAkhir = null;
  invoices.forEach(function(nota) {
    const tanggal = nota && nota.header ? parseSidDate(nota.header.tanggal) : null;
    if (!tanggal) return;
    if (!tanggalAwal || tanggal < tanggalAwal) tanggalAwal = tanggal;
    if (!tanggalAkhir || tanggal > tanggalAkhir) tanggalAkhir = tanggal;
  });

  let totalInvoice = 0;
  let totalBayar = 0;
  let totalAngsuran = 0;
  let totalSaldoHutang = 0;

  invoices.forEach(function(nota) {
    const summary = nota.summary || {};
    totalInvoice += Number(summary.jumlah || 0);
    totalBayar += Number(summary.bayar || 0);
    totalAngsuran += Number(summary.angsuran || 0);
    totalSaldoHutang += Number(summary.piutang || 0);
  });

  const ringkasanSaldo = Number(data.total_outstanding || 0);
  const selisihSaldo = totalSaldoHutang - ringkasanSaldo;

  if (Math.abs(selisihSaldo) > 0.01) {
    throw new Error(
      'Validasi total saldo 6D.2 gagal. Detail=' +
      totalSaldoHutang + ', Ringkasan=' + ringkasanSaldo
    );
  }

  const alamat = String(data.alamat || '').trim();
  const namaPelanggan = String(data.nama_pelanggan || '').trim();
  const kodePelanggan = String(data.kode_pelanggan || '').trim();

  let html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
  html += '<style>';
  html += '@page { size: A4 portrait; margin: 8mm 7mm 10mm 7mm; }';
  html += 'html,body{margin:0;padding:0;background:#fff;color:#111;}';
  html += 'body{font-family:Arial,Helvetica,sans-serif;font-size:8.2pt;line-height:1.2;}';
  html += '.page{width:100%;box-sizing:border-box;}';
  html += '.brand{font-size:16pt;font-weight:700;letter-spacing:.2px;}';
  html += '.company{font-size:9.5pt;font-weight:700;margin-top:1px;}';
  html += '.address{font-size:8pt;margin-top:2px;}';
  html += '.phone{font-size:8pt;margin-top:1px;}';
  html += '.separator{border-top:2px solid #111;margin:5px 0 6px;}';
  html += '.title{font-size:12pt;font-weight:700;text-transform:uppercase;margin-bottom:4px;}';
  html += '.meta{width:100%;border-collapse:collapse;margin-bottom:5px;}';
  html += '.meta td{padding:1.5px 2px;vertical-align:top;}';
  html += '.meta .label{font-weight:700;width:85px;}';
  html += '.meta .customer{font-weight:700;}';
  html += '.info-line{margin-top:1px;}';
  html += '.report{width:100%;border-collapse:collapse;table-layout:fixed;}';
  html += '.report col.c-no{width:5%;}';
  html += '.report col.c-kode{width:19%;}';
  html += '.report col.c-name{width:34%;}';
  html += '.report col.c-sat{width:8%;}';
  html += '.report col.c-qty{width:7%;}';
  html += '.report col.c-harga{width:13.5%;}';
  html += '.report col.c-subtotal{width:13.5%;}';
  html += '.report th{border-top:1px solid #222;border-bottom:1px solid #222;padding:3px 2px;font-size:7.6pt;text-align:left;vertical-align:middle;}';
  html += '.report th.center{text-align:center;}';
  html += '.report th.money{text-align:right;}';
  html += '.report td{padding:2px 2px;vertical-align:top;}';
  html += '.nota-row{font-weight:700;border-top:1px solid #888;page-break-inside:avoid;}';
  html += '.nota-row td{padding-top:4px;padding-bottom:2px;}';
  html += '.nota-no{text-align:center;}';
  html += '.nota-kode{font-weight:700;}';
  html += '.item-row{page-break-inside:avoid;}';
  html += '.item-code{font-size:7.6pt;}';
  html += '.item-name{font-size:7.7pt;}';
  html += '.center{text-align:center;}';
  html += '.qty{text-align:right;white-space:nowrap;}';
  html += '.money{text-align:right;white-space:nowrap;}';
  html += '.subtotal{font-weight:600;}';
  html += '.summary-wrap{margin-top:8px;border-top:2px solid #111;padding-top:5px;page-break-inside:avoid;}';
  html += '.summary-title{font-weight:700;font-size:9.5pt;margin-bottom:4px;}';
  html += '.summary-table{width:100%;border-collapse:collapse;}';
  html += '.summary-table td{padding:2px 2px;}';
  html += '.summary-label{font-weight:700;width:30%;}';
  html += '.summary-value{text-align:right;font-weight:700;width:25%;}';
  html += '.signature{float:right;width:42%;text-align:center;margin-top:-2px;}';
  html += '.signature-space{height:42px;}';
  html += '.signature-line{border-bottom:1px solid #111;margin:0 15px 2px;}';
  html += '.payment{clear:both;margin-top:12px;padding-top:5px;border-top:1px solid #777;page-break-inside:avoid;}';
  html += '.payment-title{font-weight:700;margin-bottom:3px;}';
  html += '.payment p{margin:1px 0;}';
  html += '.footer-total{margin-top:5px;padding-top:4px;border-top:2px solid #111;font-size:10pt;font-weight:700;text-align:right;}';
  html += '</style></head><body><div class="page">';

  html += '<div class="brand">TB. NUSANTARA</div>';
  html += '<div class="company">CV NUSANTARA BUILDING MATERIAL</div>';
  html += '<div class="address">Jl. Lintas Selatan Surorejan Puring Kebumen 54383</div>';
  html += '<div class="phone">081-234-563-843</div>';
  html += '<div class="separator"></div>';

  html += '<div class="title">LAPORAN DETAIL PIUTANG PELANGGAN</div>';
  html += '<table class="meta">';
  html += '<tr><td class="label">TANGGAL CETAK</td><td>: ' + stage6d2EscapeHtml_(tanggalCetak) + '</td></tr>';
  html += '<tr><td class="label">PERIODE NOTA</td><td>: ' +
    stage6d2EscapeHtml_(stage6d2FormatDate_(tanggalAwal ? Utilities.formatDate(tanggalAwal, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '')) +
    ' S/D ' +
    stage6d2EscapeHtml_(stage6d2FormatDate_(tanggalAkhir ? Utilities.formatDate(tanggalAkhir, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '')) +
    '</td></tr>';
  html += '<tr><td class="label">Pelanggan</td><td class="customer">: ' + stage6d2EscapeHtml_(namaPelanggan) + ' &nbsp;&nbsp;&nbsp; Kode : ' + stage6d2EscapeHtml_(kodePelanggan) + '</td></tr>';
  html += '<tr><td class="label">Alamat</td><td>: ' + stage6d2EscapeHtml_(alamat || '-') + '</td></tr>';
  html += '</table>';

  html += '<table class="report">';
  html += '<colgroup>';
  html += '<col class="c-no"><col class="c-kode"><col class="c-name"><col class="c-sat"><col class="c-qty"><col class="c-harga"><col class="c-subtotal">';
  html += '</colgroup>';
  html += '<thead><tr>';
  html += '<th class="center">NO</th>';
  html += '<th>NOTA / KODE BARANG</th>';
  html += '<th>NAMA BARANG</th>';
  html += '<th class="center">SAT</th>';
  html += '<th class="money">QTY</th>';
  html += '<th class="money">HARGA</th>';
  html += '<th class="money">SUBTOTAL</th>';
  html += '</tr></thead><tbody>';

  invoices.forEach(function(nota, index) {
    const header = nota.header || {};
    const items = Array.isArray(nota.items) ? nota.items : [];

    html += '<tr class="nota-row">';
    html += '<td class="nota-no">' + stage6d2EscapeHtml_(String(index + 1).padStart(2, '0')) + '</td>';
    html += '<td colspan="2">' + stage6d2EscapeHtml_(header.kode_transaksi || '') +
      ' &nbsp;&nbsp; Tanggal: ' + stage6d2EscapeHtml_(stage6d2FormatDate_(header.tanggal)) + '</td>';
    html += '<td colspan="2">JT: ' + stage6d2EscapeHtml_(stage6d2FormatDate_(header.jatuh_tempo)) + '</td>';
    html += '<td colspan="2">Umur: ' + stage6d2EscapeHtml_(stage6d2FormatAge_(header.umur_hari)) + '</td>';
    html += '</tr>';

    items.forEach(function(item) {
      html += '<tr class="item-row">';
      html += '<td></td>';
      html += '<td class="item-code">' + stage6d2EscapeHtml_(item.kode_barang || '') + '</td>';
      html += '<td class="item-name">' + stage6d2EscapeHtml_(item.nama_barang || '') + '</td>';
      html += '<td class="center">' + stage6d2EscapeHtml_(item.satuan || '') + '</td>';
      html += '<td class="qty">' + stage6d2EscapeHtml_(stage6d2FormatNumber_(item.qty)) + '</td>';
      html += '<td class="money">' + stage6d2EscapeHtml_(stage6d2FormatNumber_(item.harga)) + '</td>';
      html += '<td class="money subtotal">' + stage6d2EscapeHtml_(stage6d2FormatNumber_(item.subtotal)) + '</td>';
      html += '</tr>';
    });
  });

  html += '</tbody></table>';

  html += '<div class="summary-wrap">';
  html += '<table class="summary-table"><tr>';
  html += '<td colspan="2" class="summary-title">RINGKASAN</td>';
  html += '<td rowspan="5" class="signature">TTD<div class="signature-space"></div><div class="signature-line"></div><div>Wasimun</div></td>';
  html += '</tr>';
  html += '<tr><td class="summary-label">TOTAL INVOICE</td><td class="summary-value">' + stage6d2EscapeHtml_(stage6d2FormatRupiah_(totalInvoice)) + '</td></tr>';
  html += '<tr><td class="summary-label">TOTAL BAYAR</td><td class="summary-value">' + stage6d2EscapeHtml_(stage6d2FormatRupiah_(totalBayar)) + '</td></tr>';
  html += '<tr><td class="summary-label">TOTAL ANGSURAN</td><td class="summary-value">' + stage6d2EscapeHtml_(stage6d2FormatRupiah_(totalAngsuran)) + '</td></tr>';
  html += '<tr><td class="summary-label">TOTAL SALDO HUTANG</td><td class="summary-value">' + stage6d2EscapeHtml_(stage6d2FormatRupiah_(totalSaldoHutang)) + '</td></tr>';
  html += '</table>';

  html += '<div class="payment">';
  html += '<div class="payment-title">Pembayaran dapat dilakukan melalui transfer:</div>';
  html += '<p><strong>BRI</strong></p>';
  html += '<p>a.n. Wasimun</p>';
  html += '<p>No. Rekening: 003201105050505</p>';
  html += '</div>';

  html += '<div class="footer-total">TOTAL SALDO HUTANG : ' + stage6d2EscapeHtml_(stage6d2FormatRupiah_(totalSaldoHutang)) + '</div>';
  html += '</div></div></body></html>';

  return {
    html: html,
    invoice_count: invoices.length,
    total_invoice: totalInvoice,
    total_bayar: totalBayar,
    total_angsuran: totalAngsuran,
    total_saldo_hutang: totalSaldoHutang,
    tanggal_awal: tanggalAwal ? formatSidDate(tanggalAwal) : '',
    tanggal_akhir: tanggalAkhir ? formatSidDate(tanggalAkhir) : '',
    validation_difference: selisihSaldo
  };
}

function getSemuaNotaOutstanding_6D2(kodePelanggan) {
  const kode = validateStage6CustomerCode_(kodePelanggan);
  const started = Date.now();
  const ringkasan = getRingkasanPiutangPelanggan(kode);
  const invoices = [];

  ringkasan.data.forEach(function(row, index) {
    const kodeTransaksi = validateStage6TransactionCode_(row.kode_transaksi);

    Logger.log(
      'STAGE 6D.2 DETAIL ' + (index + 1) + '/' +
      ringkasan.data.length + ' | KODE=' + kodeTransaksi
    );

    const nota = getNotaTransaksiUntukPiutangPdf(kodeTransaksi);

    if (!nota || nota.status !== 'success') {
      throw new Error('Gagal mengambil nota 6D.2: ' + kodeTransaksi);
    }

    if (!nota.summary || Number(nota.summary.piutang) <= 0) {
      throw new Error('Invoice ' + kodeTransaksi + ' tidak outstanding.');
    }

    invoices.push(nota);
  });

  let totalOutstanding = 0;
  invoices.forEach(function(nota) {
    totalOutstanding += Number(nota.summary.piutang || 0);
  });

  const selisih = totalOutstanding - Number(ringkasan.total_outstanding || 0);

  if (Math.abs(selisih) > 0.01) {
    throw new Error(
      'Validasi total outstanding 6D.2 gagal. ' +
      'Ringkasan=' + ringkasan.total_outstanding +
      ', detail=' + totalOutstanding
    );
  }

  return {
    status: 'success',
    generated_at: new Date().toISOString(),
    kode_pelanggan: kode,
    nama_pelanggan: ringkasan.nama_pelanggan,
    telp: ringkasan.telp,
    alamat: ringkasan.alamat,
    count: invoices.length,
    total_outstanding: totalOutstanding,
    ringkasan: ringkasan.data,
    invoices: invoices,
    duration_ms: Date.now() - started
  };
}

function getPdfSemuaDetailPiutang_6D2(kodePelanggan) {
  const started = Date.now();
  const data = getSemuaNotaOutstanding_6D2(kodePelanggan);
  const report = stage6d2BuildReportHtml_(data);

  const blob = HtmlService
    .createHtmlOutput(report.html)
    .getBlob()
    .getAs(MimeType.PDF)
    .setName('Laporan_Detail_Piutang_' + data.kode_pelanggan + '_6D2.pdf');

  const pdfBytes = blob.getBytes();
inspectPdfBytes_(
  pdfBytes,
  "6D.2 " + data.kode_pelanggan
);
  validateGeneratedPdfBytes_(
    pdfBytes,
    'PDF 6D.2'
  );

  return {
    status: 'success',
    generated_at: new Date().toISOString(),
    kode_pelanggan: data.kode_pelanggan,
    nama_pelanggan: data.nama_pelanggan,
    invoice_count: report.invoice_count,
    total_invoice: report.total_invoice,
    total_bayar: report.total_bayar,
    total_angsuran: report.total_angsuran,
    total_saldo_hutang: report.total_saldo_hutang,
    validation_difference: report.validation_difference,
    tanggal_awal: report.tanggal_awal,
    tanggal_akhir: report.tanggal_akhir,
    filename: blob.getName(),
    mime_type: blob.getContentType(),
    size_bytes: pdfBytes.length,
    pdf_base64: Utilities.base64Encode(pdfBytes),
    duration_ms: Date.now() - started
  };
}

function testStage6D2() {
  const kodePelanggan = '2102029';
  const started = Date.now();

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - TAHAP 6D.2');
  Logger.log('TEST PDF LAPORAN DETAIL PIUTANG');
  Logger.log('READ-ONLY');
  Logger.log('PELANGGAN : ' + kodePelanggan);
  Logger.log('==============================================');

  const result = getPdfSemuaDetailPiutang_6D2(kodePelanggan);

  const validation =
    result.status === 'success' &&
    result.mime_type === 'application/pdf' &&
    Number(result.size_bytes) > 0 &&
    Number(result.invoice_count) === 11 &&
    Number(result.total_saldo_hutang) === 2983000 &&
    Math.abs(Number(result.validation_difference)) < 0.01 &&
    Number(result.pdf_base64.length) > 0;

  const output = {
    status: validation ? 'PASS' : 'FAIL',
    read_only: true,
    duration_ms: Date.now() - started,
    kode_pelanggan: result.kode_pelanggan,
    nama_pelanggan: result.nama_pelanggan,
    invoice_count: result.invoice_count,
    total_invoice: result.total_invoice,
    total_bayar: result.total_bayar,
    total_angsuran: result.total_angsuran,
    total_saldo_hutang: result.total_saldo_hutang,
    tanggal_awal: result.tanggal_awal,
    tanggal_akhir: result.tanggal_akhir,
    filename: result.filename,
    mime_type: result.mime_type,
    size_bytes: result.size_bytes,
    base64_length: result.pdf_base64.length,
    validation_difference: result.validation_difference,
    validation_pdf: result.mime_type === 'application/pdf' && result.size_bytes > 0,
    validation_total: Number(result.total_saldo_hutang) === 2983000,
    validation_count: Number(result.invoice_count) === 11,
    validation: validation
  };

  Logger.log(JSON.stringify(output, null, 2));
  return output;
}


/**
 * TEST 6D.2 - INSPEKSI PDF ASLI DI APPS SCRIPT
 *
 * Jalankan fungsi ini langsung dari Apps Script.
 * Tidak membutuhkan parameter.
 *
 * Tujuan:
 * - menggunakan pelanggan nyata 2404002 (BPK KIMIN)
 * - menjalankan generator 6D.2
 * - inspectPdfBytes_() memeriksa BYTE PDF sebelum masuk JSON/API
 * - tidak menulis/mengubah data SID
 */
function testStage6D2Inspect() {
  const kodePelanggan = '2404002';
  const started = Date.now();

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - DIAGNOSTIC PDF 6D.2');
  Logger.log('READ-ONLY');
  Logger.log('PELANGGAN : ' + kodePelanggan);
  Logger.log('==============================================');

  try {
    const result = getPdfSemuaDetailPiutang_6D2(kodePelanggan);

    const output = {
      status: result && result.status === 'success' ? 'PASS' : 'CHECK_REQUIRED',
      read_only: true,
      kode_pelanggan: result ? result.kode_pelanggan : kodePelanggan,
      nama_pelanggan: result ? result.nama_pelanggan : '',
      invoice_count: result ? result.invoice_count : null,
      total_saldo_hutang: result ? result.total_saldo_hutang : null,
      size_bytes: result ? result.size_bytes : null,
      base64_length: result ? String(result.pdf_base64 || '').length : 0,
      mime_type: result ? result.mime_type : null,
      validation_difference: result ? result.validation_difference : null,
      duration_ms: Date.now() - started
    };

    Logger.log('=== HASIL DIAGNOSTIC 6D.2 ===');
    Logger.log(JSON.stringify(output, null, 2));
    Logger.log('==============================================');

    return output;
  } catch (error) {
    Logger.log('=== DIAGNOSTIC 6D.2 ERROR ===');
    Logger.log(String(error && error.stack ? error.stack : error));
    Logger.log('==============================================');
    throw error;
  }
}

function inspectPdfBytes_(bytes, label) {
  if (!bytes || !bytes.length) {
    Logger.log("PDF INSPECT %s: EMPTY", label);
    return;
  }

  const text = Utilities.newBlob(bytes).getDataAsString();
  const tailStart = Math.max(0, text.length - 4096);
  const tail = text.substring(tailStart);

  Logger.log("========================================");
  Logger.log("PDF INSPECT: %s", label);
  Logger.log("SIZE: %s", bytes.length);
  Logger.log("HEADER: %s", text.substring(0, 8));
  Logger.log("HAS startxref: %s", tail.indexOf("startxref") >= 0);
  Logger.log("HAS %%EOF: %s", tail.indexOf("%%EOF") >= 0);

  const eofIndex = text.lastIndexOf("%%EOF");
  const xrefIndex = text.lastIndexOf("startxref");

  Logger.log("startxref INDEX: %s", xrefIndex);
  Logger.log("%%EOF INDEX: %s", eofIndex);

  if (eofIndex >= 0) {
    Logger.log(
      "TAIL AROUND EOF:\n%s",
      text.substring(
        Math.max(0, eofIndex - 300),
        eofIndex + 50
      )
    );
  } else {
    Logger.log(
      "LAST 1000 BYTES:\n%s",
      text.substring(
        Math.max(0, text.length - 1000)
      )
    );
  }

  Logger.log("========================================");
}

/**
 * TB NUSANTARA - DEV BACKEND API V1
 *
 * Adapter HTTP untuk frontend eksternal (mis. GitHub Pages).
 * Business logic existing tidak dipindahkan ke sini; adapter hanya
 * memanggil fungsi backend yang sudah ada.
 *
 * IMPORTANT:
 * - Jangan menaruh SID_API_KEY di source code.
 * - Simpan SID_API_KEY di Script Properties GAS Development.
 * - Jangan expose arbitrary SQL dari endpoint publik.
 *
 * DIAGNOSTIC NOTE:
 * - Fingerprint PDF 6D.2 ditambahkan hanya pada adapter HTTP.
 * - Generator PDF existing TIDAK diubah.
 * - Fingerprint digunakan untuk membandingkan byte PDF sebelum
 *   JSON dikirim ke frontend dengan byte yang diterima frontend.
 */

function apiV1Handle_(e, method) {
  try {
    var request = apiV1ParseRequest_(e, method);
    var action = String(request.action || '').trim();

    if (!action) {
      return apiV1Json_({
        success: false,
        error: 'Parameter action wajib diisi.',
        api_version: 'v1'
      });
    }

    var result = apiV1Dispatch_(action, request);

    return apiV1Json_({
      success: true,
      api_version: 'v1',
      action: action,
      data: result
    });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return apiV1Json_({
      success: false,
      api_version: 'v1',
      error: err && err.message ? err.message : String(err)
    });
  }
}

function apiV1ParseRequest_(e, method) {
  var params = (e && e.parameter) ? e.parameter : {};
  var body = {};

  if (method === 'POST' && e && e.postData && e.postData.contents) {
    var raw = String(e.postData.contents || '').trim();
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch (jsonError) {
        throw new Error('Body POST harus berupa JSON valid.');
      }
    }
  }

  var request = {};
  Object.keys(params).forEach(function(key) {
    request[key] = params[key];
  });
  Object.keys(body).forEach(function(key) {
    request[key] = body[key];
  });

  return request;
}

function apiV1Dispatch_(action, request) {
  switch (action) {
    case 'health':
      return {
        status: 'ok',
        environment: 'development',
        timestamp: new Date().toISOString()
      };

    case 'validateConfig':
      return apiV1ValidateConfig_();

    case 'testSidApiConnection':
      return testSidApiConnection();

    case 'piutang':
      return getPiutangPelangganLaporan();

    case 'customerPiutangDetail':
      return getDetailPiutangPelanggan(
        apiV1Required_(request, 'kode_pelanggan')
      );

    case 'tabungan':
      return getSaldoTabunganPelanggan(
        apiV1Required_(request, 'kode_pelanggan')
      );

    case 'pdfRingkasanPiutang':
      return getPdfRingkasanPiutangPelanggan(
        apiV1Required_(request, 'kode_pelanggan')
      );

    case 'pdfSemuaDetailPiutang6D1':
      return getPdfSemuaDetailPiutang_6D1(
        apiV1Required_(request, 'kode_pelanggan')
      );

    case 'pdfSemuaDetailPiutang6D2':
      return apiV1Pdf6D2WithFingerprint_(
        apiV1Required_(request, 'kode_pelanggan')
      );

    case 'pdfInvoice':
      return getPdfInvoiceTransaksi(
        apiV1Required_(request, 'kode_transaksi')
      );

    default:
      throw new Error('Action API V1 tidak dikenal: ' + action);
  }
}

/**
 * READ-ONLY diagnostic wrapper untuk PDF 6D.2.
 *
 * Tidak membuat PDF baru dan tidak mengubah generator existing.
 * Fungsi hanya:
 * 1. Memanggil generator 6D.2 yang sudah ada.
 * 2. Decode pdf_base64 yang dihasilkan generator.
 * 3. Menghitung SHA-256 dari byte PDF tersebut.
 * 4. Menambahkan metadata fingerprint ke response API.
 *
 * Tujuan:
 * membuktikan fingerprint PDF pada titik sebelum JSON.stringify().
 */
function apiV1Pdf6D2WithFingerprint_(kodePelanggan) {
  var result = getPdfSemuaDetailPiutang_6D2(kodePelanggan);

  if (!result || result.status !== 'success') {
    return result;
  }

  var base64 = String(result.pdf_base64 || '');

  if (!base64) {
    throw new Error(
      'PDF 6D.2 tidak memiliki pdf_base64 untuk fingerprint.'
    );
  }

  var pdfBytes;

  try {
    pdfBytes = Utilities.base64Decode(base64);
  } catch (err) {
    throw new Error(
      'Gagal decode pdf_base64 untuk fingerprint PDF 6D.2: ' +
      (err && err.message ? err.message : String(err))
    );
  }

  var actualSize = pdfBytes.length;
  var reportedSize = Number(result.size_bytes || 0);
  var sha256 = apiV1Sha256Hex_(pdfBytes);

  var headerOk =
    actualSize >= 5 &&
    pdfBytes[0] === 37 &&  // %
    pdfBytes[1] === 80 &&  // P
    pdfBytes[2] === 68 &&  // D
    pdfBytes[3] === 70 &&  // F
    pdfBytes[4] === 45;    // -

  var pdfText = Utilities.newBlob(pdfBytes).getDataAsString();

  var eofIndex = pdfText.lastIndexOf('%%EOF');
  var startxrefIndex = pdfText.lastIndexOf('startxref');

  var fingerprint = {
    diagnostic: 'pdf_transport_fingerprint_v1',
    read_only: true,

    reported_size_bytes: reportedSize,
    decoded_size_bytes: actualSize,
    size_match: reportedSize === actualSize,

    base64_length: base64.length,

    sha256: sha256,

    header_ok: headerOk,

    startxref_present: startxrefIndex >= 0,
    startxref_index: startxrefIndex,

    eof_present: eofIndex >= 0,
    eof_index: eofIndex,

    base64_head: base64.substring(0, 80),
    base64_tail: base64.substring(
      Math.max(0, base64.length - 120)
    ),

    pdf_tail: pdfText.substring(
      Math.max(0, pdfText.length - 120)
    )
  };

  console.log(
    '=============================================='
  );
  console.log(
    'TB NUSANTARA - PDF 6D.2 TRANSPORT FINGERPRINT'
  );
  console.log(
    'KODE PELANGGAN: ' + kodePelanggan
  );
  console.log(
    'REPORTED SIZE : ' + reportedSize
  );
  console.log(
    'DECODED SIZE  : ' + actualSize
  );
  console.log(
    'BASE64 LENGTH : ' + base64.length
  );
  console.log(
    'SHA256        : ' + sha256
  );
  console.log(
    'HEADER OK     : ' + headerOk
  );
  console.log(
    'STARTXREF     : ' + (startxrefIndex >= 0)
  );
  console.log(
    'EOF           : ' + (eofIndex >= 0)
  );
  console.log(
    'BASE64 HEAD   : ' + fingerprint.base64_head
  );
  console.log(
    'BASE64 TAIL   : ' + fingerprint.base64_tail
  );
  console.log(
    'PDF TAIL      : ' + fingerprint.pdf_tail
  );
  console.log(
    '=============================================='
  );

  result.pdf_transport_fingerprint = fingerprint;

  return result;
}

function apiV1Sha256Hex_(bytes) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    bytes
  );

  return digest.map(function(b) {
    var value = b < 0 ? b + 256 : b;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function apiV1Required_(request, key) {
  var value = request[key];
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error('Parameter ' + key + ' wajib diisi.');
  }
  return String(value).trim();
}

function apiV1ValidateConfig_() {
  var key = PropertiesService
    .getScriptProperties()
    .getProperty('SID_API_KEY');

  return {
    sid_api_key_configured: !!key,
    sid_api_key_length: key ? String(key).length : 0,
    environment: 'development'
  };
}

function apiV1Json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * ============================================================
 * UNIFIED HTTP ENTRYPOINT
 * ============================================================
 *
 * - Request dengan ?action=... masuk ke API V1.
 * - Request tanpa action mempertahankan HTML legacy.
 * - Hanya ada satu doGet() dan satu doPost().
 */
function doGet(e) {
  var action = e && e.parameter
    ? String(e.parameter.action || '').trim()
    : '';

  if (action) {
    return apiV1Handle_(e, 'GET');
  }

  return doGetLegacyHtml_();
}

function doPost(e) {
  return apiV1Handle_(e, 'POST');
}
