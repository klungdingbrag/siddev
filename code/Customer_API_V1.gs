/**
 * TB NUSANTARA - CUSTOMER API V1
 *
 * Read-only customer layer for the Development backend.
 *
 * Data contract:
 * - Customer = satu entitas di frontend. Tidak membedakan cabang/toko lain.
 * - saldo_tabungan = pelanggan.saldo_tabungan.
 * - saldo_piutang = agregasi outstanding penjualan.piutang, transaction-first.
 * - Frontend tidak melakukan accounting.
 */

function customerSqlQuoteV1(value) {
  return "'" + String(value == null ? '' : value).replace(/'/g, "''") + "'";
}

/**
 * Customer aktif secara finansial:
 * - saldo_tabungan > 0
 *   ATAU
 * - saldo_piutang > 0
 *
 * Dipisahkan dari getPelangganLaporanV1() agar fungsi lama tetap tersedia
 * untuk audit dan rollback. Cursor pagination tetap kompatibel dengan frontend.
 */
function getPelangganAktifFinansialSemuaV1() {
  Logger.log('CUSTOMER API LIST VERSION: paginated-v1-2026-10-18 | pageSize=50 | maxPages=100');
  // SID Retail dapat memotong response JSON yang terlalu besar. Ambil data
  // dalam halaman kecil agar setiap response tetap terbatas dan valid.
  // Hanya fungsi daftar pelanggan aktif ini yang memakai pagination.
  var pageSize = 50;
  var maxPages = 100;
  var cursor = '';
  var rows = [];
  var complete = false;

  for (var page = 1; page <= maxPages; page++) {
    var query =
      'SELECT p.kode,p.nama,p.alamat,p.telp,' +
      'COALESCE(p.saldo_tabungan,0) AS saldo_tabungan,' +
      'COALESCE(x.saldo_piutang,0) AS saldo_piutang,' +
      'COALESCE(x.jumlah_nota_outstanding,0) AS jumlah_nota_outstanding ' +
      'FROM pelanggan p ' +
      'LEFT JOIN (' +
        'SELECT pelanggan,' +
        'SUM(CASE WHEN COALESCE(piutang,0) > 0 THEN piutang ELSE 0 END) AS saldo_piutang,' +
        'COUNT(*) AS jumlah_nota_outstanding ' +
        'FROM penjualan ' +
        'WHERE COALESCE(piutang,0) > 0 ' +
        'GROUP BY pelanggan' +
      ') x ON x.pelanggan = p.kode ' +
      'WHERE p.kode IS NOT NULL AND TRIM(p.kode) <> ' + customerSqlQuoteV1('') +
      ' AND (COALESCE(p.saldo_tabungan,0) > 0 OR COALESCE(x.saldo_piutang,0) > 0)';

    if (cursor) {
      query += ' AND p.kode > ' + customerSqlQuoteV1(cursor);
    }

    query += ' ORDER BY p.kode ASC LIMIT ' + pageSize;

    var result = sidRetailQuery(query);
    if (!result || result.status !== 'success') {
      throw new Error('Gagal mengambil halaman pelanggan aktif #' + page + '.');
    }

    var pageRows = Array.isArray(result.data)
      ? result.data
      : (Array.isArray(result.rows) ? result.rows : []);

    Logger.log('PELANGGAN AKTIF PAGE ' + page + ': ' + pageRows.length + ' rows');
    rows = rows.concat(pageRows);

    if (pageRows.length < pageSize) {
      complete = true;
      break;
    }

    var nextCursor = String(pageRows[pageRows.length - 1].kode || '').trim();
    if (!nextCursor || nextCursor === cursor) {
      throw new Error(
        'Pagination pelanggan aktif berhenti karena cursor kode tidak bergerak.'
      );
    }
    cursor = nextCursor;
  }

  if (!complete) {
    throw new Error(
      'Pengambilan pelanggan aktif melewati batas ' + maxPages +
      ' halaman. Data tidak dikembalikan agar hasil tidak terpotong diam-diam.'
    );
  }

  var data = rows.map(function(row) {
    return {
      kode_pelanggan: String(row.kode || '').trim(),
      nama: String(row.nama || '').trim() || String(row.kode || '').trim(),
      alamat: String(row.alamat || '').trim(),
      telp: String(row.telp || '').trim(),
      saldo_tabungan: Number(row.saldo_tabungan || 0),
      saldo_piutang: Number(row.saldo_piutang || 0),
      jumlah_nota_outstanding: Number(row.jumlah_nota_outstanding || 0)
    };
  });

  Logger.log('TOTAL PELANGGAN AKTIF TERAMBIL: ' + data.length);

  return {
    status: 'success',
    data: data,
    pagination: {
      mode: 'client-side',
      total: data.length
    },
    source_contract: {
      customer: 'pelanggan',
      saldo_tabungan: 'pelanggan.saldo_tabungan',
      saldo_piutang: 'penjualan.piutang',
      financial_active_rule: 'saldo_tabungan > 0 OR saldo_piutang > 0',
      piutang_mode: 'transaction-first'
    }
  };
}
function getPelangganDetailV1(kodePelanggan) {
  var kode = String(kodePelanggan || '').trim();
  if (!kode) throw new Error('Kode pelanggan wajib diisi.');

  var masterResult = sidRetailQuery(
    'SELECT kode,nama,alamat,telp,COALESCE(saldo_tabungan,0) AS saldo_tabungan ' +
    'FROM pelanggan WHERE kode = ' + customerSqlQuoteV1(kode) + ' LIMIT 1'
  );
  var masterRows = masterResult.data || masterResult.rows || [];

  if (!masterRows.length) {
    throw new Error('Pelanggan tidak ditemukan: ' + kode);
  }

  var row = masterRows[0];

  var piutangResult = sidRetailQuery(
    'SELECT COUNT(CASE WHEN COALESCE(piutang,0) > 0 THEN 1 ELSE NULL END) AS jumlah_nota_outstanding,' +
    'COALESCE(SUM(CASE WHEN COALESCE(piutang,0) > 0 THEN piutang ELSE 0 END),0) AS saldo_piutang ' +
    'FROM penjualan WHERE pelanggan = ' + customerSqlQuoteV1(kode)
  );
  var piutangRows = piutangResult.data || piutangResult.rows || [];
  var piutang = piutangRows[0] || {};

  return {
    status: 'success',
    customer: {
      kode_pelanggan: String(row.kode || kode).trim(),
      nama: String(row.nama || '').trim() || kode,
      alamat: String(row.alamat || '').trim(),
      telp: String(row.telp || '').trim(),
      saldo_tabungan: Number(row.saldo_tabungan || 0),
      saldo_piutang: Number(piutang.saldo_piutang || 0),
      jumlah_nota_outstanding: Number(piutang.jumlah_nota_outstanding || 0)
    },
    source_contract: {
      customer: 'pelanggan',
      saldo_tabungan: 'pelanggan.saldo_tabungan',
      saldo_piutang: 'penjualan.piutang',
      piutang_mode: 'transaction-first'
    }
  };
}

function getRiwayatTabunganPelangganV1(kodePelanggan, limit) {
  var kode = String(kodePelanggan || '').trim();
  if (!kode) throw new Error('Kode pelanggan wajib diisi.');

  var pageSize = Number(limit || 500);
  if (!isFinite(pageSize)) pageSize = 500;
  pageSize = Math.max(1, Math.min(500, Math.floor(pageSize)));

  var masterResult = sidRetailQuery(
    'SELECT kode,nama,COALESCE(saldo_tabungan,0) AS saldo_tabungan ' +
    'FROM pelanggan WHERE kode = ' + customerSqlQuoteV1(kode) + ' LIMIT 1'
  );
  var masterRows = masterResult.data || masterResult.rows || [];

  if (!masterRows.length) {
    throw new Error('Pelanggan tidak ditemukan: ' + kode);
  }

  var row = masterRows[0];

  var historyResult = sidRetailQuery(
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,keterangan ' +
    'FROM tabungan WHERE pelanggan = ' + customerSqlQuoteV1(kode) +
    ' ORDER BY tanggal ASC,jam ASC,kode ASC LIMIT ' + pageSize
  );
  var historyRows = historyResult.data || historyResult.rows || [];

  var running = 0;
  var data = historyRows.map(function(item) {
    var jumlah = Number(item.jumlah || 0);
    var jenis = String(item.jenis || '').trim().toUpperCase();

    if (jenis === 'AMBIL' || jenis === 'TARIKAN' ||
        jenis === 'PENARIKAN' || jenis === 'PENGAMBILAN') {
      running -= jumlah;
    } else {
      running += jumlah;
    }

    return {
      kode_transaksi: String(item.kode || ''),
      tanggal: String(item.tanggal || ''),
      jam: String(item.jam || ''),
      jenis: jenis,
      jumlah: jumlah,
      keterangan: String(item.keterangan || ''),
      running_balance: running
    };
  });

  return {
    status: 'success',
    customer: {
      kode_pelanggan: String(row.kode || kode).trim(),
      nama: String(row.nama || '').trim() || kode,
      saldo_tabungan: Number(row.saldo_tabungan || 0)
    },
    data: data,
    summary: {
      jumlah_transaksi: data.length,
      saldo_rekonstruksi_history: running,
      saldo_master: Number(row.saldo_tabungan || 0),
      selisih_rekonstruksi_vs_master:
        Number(row.saldo_tabungan || 0) - running
    },
    source_contract: {
      saldo_master: 'pelanggan.saldo_tabungan',
      history: 'tabungan',
      reconstruction: 'DEBET + SETORAN - AMBIL'
    }
  };
}


/**
 * Diagnostic khusus customer FIKA.
 *
 * Read-only:
 * - Menguji lookup master pelanggan.
 * - Menguji query riwayat tabungan secara terpisah.
 * - Menampilkan error SID Retail apa adanya agar akar masalah terlihat.
 *
 * Hapus setelah akar masalah selesai.
 */
