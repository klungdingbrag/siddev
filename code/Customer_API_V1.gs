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

function getPelangganLaporanV1(limit, cursor) {
  var pageSize = Number(limit || 50);
  if (!isFinite(pageSize)) pageSize = 50;
  pageSize = Math.max(1, Math.min(200, Math.floor(pageSize)));

  var lastKode = String(cursor || '').trim();

  var masterQuery =
    'SELECT kode,nama,alamat,telp,COALESCE(saldo_tabungan,0) AS saldo_tabungan ' +
    'FROM pelanggan ' +
    'WHERE kode IS NOT NULL AND TRIM(kode) <> ' +
    customerSqlQuoteV1('') +
    (lastKode ? ' AND kode > ' + customerSqlQuoteV1(lastKode) : '') +
    ' ORDER BY kode ASC LIMIT ' + pageSize;

  var masterResult = sidRetailQuery(masterQuery);
  var masterRows = masterResult.data || masterResult.rows || [];

  if (!masterRows.length) {
    return {
      status: 'success',
      data: [],
      pagination: {
        limit: pageSize,
        cursor: lastKode || null,
        next_cursor: null,
        has_more: false
      },
      source_contract: {
        customer: 'pelanggan',
        saldo_tabungan: 'pelanggan.saldo_tabungan',
        saldo_piutang: 'penjualan.piutang'
      }
    };
  }

  var codes = masterRows.map(function(row) {
    return String(row.kode || '').trim();
  }).filter(Boolean);

  var escapedCodes = codes.map(function(kode) {
    return customerSqlQuoteV1(kode);
  }).join(',');

  var piutangQuery =
    'SELECT pelanggan,' +
    'SUM(CASE WHEN COALESCE(piutang,0) > 0 THEN piutang ELSE 0 END) AS saldo_piutang,' +
    'COUNT(CASE WHEN COALESCE(piutang,0) > 0 THEN 1 ELSE NULL END) AS jumlah_nota_outstanding ' +
    'FROM penjualan ' +
    'WHERE pelanggan IN (' + escapedCodes + ') ' +
    'GROUP BY pelanggan';

  var piutangResult = sidRetailQuery(piutangQuery);
  var piutangRows = piutangResult.data || piutangResult.rows || [];
  var piutangMap = {};

  piutangRows.forEach(function(row) {
    var kode = String(row.pelanggan || '').trim();
    if (kode) {
      piutangMap[kode] = {
        saldo_piutang: Number(row.saldo_piutang || 0),
        jumlah_nota_outstanding: Number(row.jumlah_nota_outstanding || 0)
      };
    }
  });

  var data = masterRows.map(function(row) {
    var kode = String(row.kode || '').trim();
    var p = piutangMap[kode] || {
      saldo_piutang: 0,
      jumlah_nota_outstanding: 0
    };

    return {
      kode_pelanggan: kode,
      nama: String(row.nama || '').trim() || kode,
      alamat: String(row.alamat || '').trim(),
      telp: String(row.telp || '').trim(),
      saldo_tabungan: Number(row.saldo_tabungan || 0),
      saldo_piutang: p.saldo_piutang,
      jumlah_nota_outstanding: p.jumlah_nota_outstanding
    };
  });

  var nextCursor = data.length === pageSize
    ? data[data.length - 1].kode_pelanggan
    : null;

  return {
    status: 'success',
    data: data,
    pagination: {
      limit: pageSize,
      cursor: lastKode || null,
      next_cursor: nextCursor,
      has_more: Boolean(nextCursor)
    },
    source_contract: {
      customer: 'pelanggan',
      saldo_tabungan: 'pelanggan.saldo_tabungan',
      saldo_piutang: 'penjualan.piutang',
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
    'SELECT kode,tanggal,jam,pelanggan,jumlah,jenis,keterangan,kode_kas,sumber,sumber_faktur ' +
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
      kode_kas: String(item.kode_kas || ''),
      sumber: String(item.sumber || ''),
      sumber_faktur: String(item.sumber_faktur || ''),
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


function testPelangganApiV1() {
  Logger.log('==============================================');
  Logger.log('CUSTOMER API V1 TEST');
  Logger.log('==============================================');

  var list = getPelangganLaporanV1(5, '');
  Logger.log('LIST STATUS: ' + list.status);
  Logger.log('LIST COUNT: ' + list.data.length);
  Logger.log(JSON.stringify(list.data, null, 2));
  Logger.log('LIST PAGINATION: ' + JSON.stringify(list.pagination));

  var detail = getPelangganDetailV1('2404002');
  Logger.log('DETAIL STATUS: ' + detail.status);
  Logger.log(JSON.stringify(detail.customer, null, 2));

  var history = getRiwayatTabunganPelangganV1('2404002', 100);
  Logger.log('HISTORY STATUS: ' + history.status);
  Logger.log(JSON.stringify(history.summary, null, 2));

  if (list.status !== 'success' ||
      detail.status !== 'success' ||
      history.status !== 'success') {
    throw new Error('CUSTOMER API V1 TEST GAGAL.');
  }

  Logger.log('CUSTOMER API V1 TEST: PASS');
  return {
    status: 'success',
    list_count: list.data.length,
    detail_customer: detail.customer,
    history_summary: history.summary
  };
}
