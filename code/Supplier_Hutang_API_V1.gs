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

  var data = rows.map(function(row) {
    var totalNota = Number(row.total_nota || 0);
    var sisaHutang = Number(row.sisa_hutang || 0);

    return {
      nota: String(row.nota || '').trim(),
      tanggal: String(row.tanggal || '').trim(),
      total_nota: totalNota,
      sisa_hutang: sisaHutang,
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
