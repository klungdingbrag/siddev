/**
 * CUSTOMER FINANCIAL OVERLAP DIAGNOSTIC V1
 *
 * READ-ONLY diagnostic.
 *
 * Tujuan:
 * Membandingkan himpunan pelanggan berdasarkan:
 * A = tabungan saja
 * B = piutang saja
 * C = keduanya
 * D = tidak keduanya
 *
 * Definisi:
 * - Tabungan: pelanggan.saldo_tabungan > 0
 * - Piutang: agregasi penjualan.piutang > 0
 *
 * Tidak mengubah endpoint produksi.
 * Tidak mengubah data SID Retail.
 * Tidak mengubah accounting logic.
 *
 * Penting:
 * Diagnostic ini juga mencari mismatch antara:
 * - kode pelanggan pada penjualan outstanding
 * - kode pelanggan pada master pelanggan
 *
 * agar perbedaan jumlah Customer vs Piutang dapat dijelaskan.
 */

function testCustomerFinancialOverlapV1() {
  var started = Date.now();

  Logger.log('==============================================');
  Logger.log('CUSTOMER FINANCIAL OVERLAP DIAGNOSTIC V1');
  Logger.log('READ-ONLY');
  Logger.log('==============================================');

  var masterQuery =
    'SELECT kode,nama,COALESCE(saldo_tabungan,0) AS saldo_tabungan ' +
    'FROM pelanggan ' +
    'WHERE kode IS NOT NULL AND TRIM(kode) <> \'\' ' +
    'ORDER BY kode ASC';

  var masterResult = sidRetailQuery(masterQuery);
  var masterRows = masterResult.data || masterResult.rows || [];

  var masterMap = {};
  var masterDuplicateCodes = {};

  masterRows.forEach(function(row) {
    var kode = String(row.kode || '').trim();
    if (!kode) return;

    if (masterMap[kode]) {
      masterDuplicateCodes[kode] = true;
    }

    masterMap[kode] = {
      kode: kode,
      nama: String(row.nama || '').trim(),
      saldo_tabungan: Number(row.saldo_tabungan || 0)
    };
  });

  var piutangQuery =
    'SELECT pelanggan,' +
    'SUM(CASE WHEN COALESCE(piutang,0) > 0 THEN piutang ELSE 0 END) AS saldo_piutang,' +
    'COUNT(CASE WHEN COALESCE(piutang,0) > 0 THEN 1 ELSE NULL END) AS jumlah_nota_outstanding ' +
    'FROM penjualan ' +
    'WHERE COALESCE(piutang,0) > 0 ' +
    'GROUP BY pelanggan ' +
    'ORDER BY pelanggan ASC';

  var piutangResult = sidRetailQuery(piutangQuery);
  var piutangRows = piutangResult.data || piutangResult.rows || [];

  var piutangMap = {};
  var blankPiutangCustomerRows = [];

  piutangRows.forEach(function(row) {
    var kodeRaw = String(row.pelanggan == null ? '' : row.pelanggan);
    var kode = kodeRaw.trim();

    if (!kode) {
      blankPiutangCustomerRows.push(row);
      return;
    }

    piutangMap[kode] = {
      kode: kode,
      kode_raw: kodeRaw,
      saldo_piutang: Number(row.saldo_piutang || 0),
      jumlah_nota_outstanding: Number(row.jumlah_nota_outstanding || 0)
    };
  });

  var A = [];
  var B = [];
  var C = [];
  var D = [];

  Object.keys(masterMap).forEach(function(kode) {
    var tabungan = masterMap[kode].saldo_tabungan;
    var piutang = piutangMap[kode]
      ? piutangMap[kode].saldo_piutang
      : 0;

    var hasTabungan = tabungan > 0;
    var hasPiutang = piutang > 0;

    if (hasTabungan && !hasPiutang) {
      A.push(kode);
    } else if (!hasTabungan && hasPiutang) {
      B.push(kode);
    } else if (hasTabungan && hasPiutang) {
      C.push(kode);
    } else {
      D.push(kode);
    }
  });

  var piutangWithoutMaster = Object.keys(piutangMap).filter(function(kode) {
    return !masterMap[kode];
  });

  var piutangCustomerCount = Object.keys(piutangMap).length;
  var activeFinancialCount = A.length + B.length + C.length;
  var savingCustomerCount = A.length + C.length;

  var result = {
    status: 'success',
    duration_ms: Date.now() - started,

    master_customer_count: Object.keys(masterMap).length,
    piutang_customer_count: piutangCustomerCount,

    A_tabungan_saja: A.length,
    B_piutang_saja: B.length,
    C_keduanya: C.length,
    D_tidak_keduanya: D.length,

    active_financial_formula: 'A + B + C',
    active_financial_count: activeFinancialCount,

    piutang_formula: 'B + C + piutang_without_master',
    piutang_count_from_master_overlap: B.length + C.length,

    saving_formula: 'A + C',
    saving_customer_count: savingCustomerCount,

    piutang_without_master_count: piutangWithoutMaster.length,
    blank_piutang_customer_rows: blankPiutangCustomerRows.length,

    master_duplicate_code_count: Object.keys(masterDuplicateCodes).length,

    reconciliation: {
      active_financial_equals_master_nonzero:
        activeFinancialCount ===
        Object.keys(masterMap).filter(function(kode) {
          return masterMap[kode].saldo_tabungan > 0 ||
            (piutangMap[kode] && piutangMap[kode].saldo_piutang > 0);
        }).length,

      piutang_equals_overlap_when_no_orphans:
        piutangWithoutMaster.length === 0 &&
        piutangCustomerCount === B.length + C.length,

      expected_set_relationship:
        activeFinancialCount >= piutangCustomerCount
    },

    samples: {
      A_tabungan_saja: A.slice(0, 20),
      B_piutang_saja: B.slice(0, 20),
      C_keduanya: C.slice(0, 20),
      D_tidak_keduanya: D.slice(0, 20),
      piutang_without_master: piutangWithoutMaster.slice(0, 50)
    }
  };

  Logger.log(JSON.stringify(result, null, 2));
  Logger.log('==============================================');
  Logger.log('EXPECTED: ACTIVE FINANCIAL >= PIUTANG CUSTOMER');
  Logger.log(
    'ACTIVE FINANCIAL = ' + activeFinancialCount +
    ' | PIUTANG CUSTOMER = ' + piutangCustomerCount
  );
  Logger.log('==============================================');

  return result;
}
