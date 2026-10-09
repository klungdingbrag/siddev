/** 
 * TB NUSANTARA - SUPPLIER HUTANG AUDIT V1
 * ============================================================
 * READ-ONLY AUDIT MODULE
 *
 * Fokus:
 *   Kode Supplier, Nama Supplier, Total Hutang, Total Bayar,
 *   Total Sisa, lalu detail nota supplier.
 *
 * Prinsip:
 *   - READ ONLY.
 *   - Tidak mengubah Code.gs.
 *   - Tidak INSERT / UPDATE / DELETE.
 *   - Tidak membuat API/frontend.
 *   - Tidak mengasumsikan rumus hutang tanpa bukti source of truth.
 *
 * Target detail:
 *   Nota, tanggal, total nota, total bayar, sisa nota.
 *
 * Arah:
 *   SUPPLIER -> PEMBELIAN/HUTANG -> PEMBAYARAN -> SISA
 *
 * Semua hubungan di atas masih harus dibuktikan melalui audit.
 * ============================================================
 */

const SUPPLIER_HUTANG_AUDIT_V1_CONFIG = Object.freeze({
  sampleLimit: 5,

  candidateTables: [
    'supplier',
    'pemasok',
    'hutang',
    'itemhutang',
    'pembelian',
    'itempembelian',
    'pembayaranpembelian',
    'pembayaran_pembelian',
    'bayarpembelian',
    'return_pembelian',
    'header_return_pembelian',
    'returpembelian',
    'itemreturpembelian',
    'potong_hutang_return',
    'temp_item_hutang'
  ],

  supplierKeywords: [
    'supplier',
    'pemasok',
    'vendor',
    'kode_supplier',
    'kodesupplier',
    'id_supplier',
    'idsupplier'
  ],

  financialKeywords: [
    'jumlah',
    'total',
    'harga',
    'subtotal',
    'bayar',
    'pembayaran',
    'angsuran',
    'hutang',
    'saldo',
    'sisa',
    'tagihan',
    'nominal',
    'nilai'
  ],

  dateKeywords: [
    'tanggal',
    'tgl',
    'date',
    'jt',
    'jatuh',
    'tempo'
  ],

  identityKeywords: [
    'kode',
    'id',
    'no_',
    'nomor',
    'nota',
    'faktur',
    'invoice',
    'transaksi'
  ]
});


function auditSupplierHutangV1() {
  const started = Date.now();

  Logger.log('====================================================');
  Logger.log('SUPPLIER HUTANG AUDIT V1');
  Logger.log('MODE: READ-ONLY');
  Logger.log('FOKUS: SUPPLIER | HUTANG | BAYAR | SISA');
  Logger.log('====================================================');

  const tableDiscovery = auditSupplierHutangDiscoverTablesV1();
  const tableNames = tableDiscovery.tables;

  Logger.log(
    'TABLE RELEVAN: ' +
    tableNames.length +
    ' | ' +
    JSON.stringify(tableNames)
  );

  const structures = [];
  const samples = [];

  tableNames.forEach(function(tableName) {
    const structure = auditSupplierHutangStructureV1(tableName);
    structures.push(structure);

    if (structure.exists) {
      samples.push(auditSupplierHutangSampleV1(tableName));
    }
  });

  const candidateFields = auditSupplierHutangClassifyFieldsV1(structures);
  const relationshipHints =
    auditSupplierHutangRelationshipHintsV1(structures);

  const result = {
    diagnostic: 'supplier_hutang_audit_v1',
    read_only: true,

    business_target: {
      list_fields: [
        'kode_supplier',
        'nama_supplier',
        'total_hutang',
        'total_bayar',
        'total_sisa'
      ],
      detail_target: [
        'nota',
        'tanggal',
        'total_nota',
        'total_bayar',
        'sisa_nota'
      ]
    },

    duration_ms: Date.now() - started,
    discovery: tableDiscovery,
    structures: structures,
    samples: samples,
    candidate_fields: candidateFields,
    relationship_hints: relationshipHints,

    next_step:
      'Gunakan auditSupplierHutangRelationsV1() untuk membaca record nyata secara terfokus. Jangan membuat API/frontend sebelum source of truth terbukti.'
  };

  Logger.log('====================================================');
  Logger.log('SUPPLIER HUTANG AUDIT V1 SELESAI');
  Logger.log('DURATION MS: ' + result.duration_ms);
  Logger.log(
    'RELATIONSHIP HINTS: ' +
    JSON.stringify(relationshipHints)
  );
  Logger.log('====================================================');

  return result;
}


/**
 * AUDIT RECORD TERFOKUS
 * ------------------------------------------------------------
 * Tujuan:
 *   Melihat isi record nyata dari enam tabel kandidat terkuat.
 *
 * Beban:
 *   Maksimal 6 query SELECT * LIMIT 3.
 *
 * Sengaja TIDAK melakukan:
 *   - JOIN
 *   - aggregate
 *   - scan seluruh tabel
 *   - perubahan data
 *   - perubahan Code.gs
 *   - API/frontend
 */
function auditSupplierHutangRelationsV1() {
  const started = Date.now();

  const targets = [
    'supplier',
    'pembelian',
    'hutang',
    'itemhutang',
    'return_pembelian',
    'potong_hutang_return'
  ];

  Logger.log('====================================================');
  Logger.log('SUPPLIER HUTANG RELATION PROBE V1');
  Logger.log('MODE: READ-ONLY');
  Logger.log('QUERY: 6 x SELECT * LIMIT 3');
  Logger.log('====================================================');

  const result = {
    diagnostic: 'supplier_hutang_relation_probe_v1',
    read_only: true,
    query_count_target: targets.length,
    sample_limit: 3,
    tables: []
  };

  targets.forEach(function(tableName) {
    const safeTable = auditSupplierHutangValidateIdentifierV1(tableName);

    try {
      const response = sidRetailQuery(
        'SELECT * FROM ' +
        auditSupplierHutangQuoteIdentifierV1(safeTable) +
        ' LIMIT 3'
      );

      const rows =
        response && Array.isArray(response.data)
          ? response.data
          : [];

      const tableResult = {
        table: safeTable,
        success: response && response.status === 'success',
        row_count: rows.length,
        rows: rows
      };

      result.tables.push(tableResult);

      Logger.log('--- ' + safeTable + ' ---');
      Logger.log('ROWS: ' + rows.length);
      Logger.log(JSON.stringify(rows));
    } catch (error) {
      const message =
        error && error.message
          ? error.message
          : String(error);

      result.tables.push({
        table: safeTable,
        success: false,
        row_count: 0,
        error: message
      });

      Logger.log('--- ' + safeTable + ' ---');
      Logger.log('ERROR: ' + message);
    }
  });

  result.duration_ms = Date.now() - started;

  Logger.log('====================================================');
  Logger.log('SUPPLIER HUTANG RELATION PROBE V1 SELESAI');
  Logger.log('DURATION MS: ' + result.duration_ms);
  Logger.log('QUERY TERPAKAI MAKSIMAL: ' + targets.length);
  Logger.log('====================================================');

  return result;
}


/**
 * TRACE RELASI HUTANG -> ITEM HUTANG -> PEMBELIAN
 * ------------------------------------------------------------
 * Tahap berikutnya sengaja hanya SATU query.
 *
 * Kita sudah memiliki tiga contoh kode hutang dari audit sebelumnya:
 *   R32-250621003
 *   R32-290621004
 *   R32-010721005
 *
 * Query ini hanya mencari ketiga transaksi tersebut dan menampilkan:
 *   - record hutang
 *   - itemhutang yang menghubungkannya
 *   - pembelian asal / nota
 *
 * Tujuannya membuktikan apakah pola:
 *
 *   hutang.kode
 *       = itemhutang.kode
 *   itemhutang.kode_hutang
 *       = pembelian.kode
 *
 * benar-benar berlaku pada data nyata.
 *
 * Tidak ada aggregate dan tidak ada perubahan data.
 */
function auditSupplierHutangTraceV1() {
  const started = Date.now();

  const sql =
    'SELECT ' +
    'h.kode AS hutang_kode, ' +
    'h.tanggal AS hutang_tanggal, ' +
    'h.supplier AS hutang_supplier, ' +
    'h.jumlah AS hutang_jumlah, ' +
    'ih.kode AS itemhutang_kode, ' +
    'ih.kode_hutang AS itemhutang_kode_hutang, ' +
    'ih.tgl_hutang AS itemhutang_tgl_hutang, ' +
    'ih.jumlah_hutang AS itemhutang_jumlah_hutang, ' +
    'ih.return AS itemhutang_return, ' +
    'ih.jumlah AS itemhutang_jumlah, ' +
    'p.kode AS pembelian_kode, ' +
    'p.tanggal AS pembelian_tanggal, ' +
    'p.supplier AS pembelian_supplier, ' +
    'p.jumlah AS pembelian_jumlah, ' +
    'p.hutang AS pembelian_hutang, ' +
    'p.lunas AS pembelian_lunas, ' +
    'p.kekurangan_sdh_dibayar AS pembelian_kekurangan_sdh_dibayar, ' +
    'p.hutang_ke AS pembelian_hutang_ke ' +
    'FROM ' + auditSupplierHutangQuoteIdentifierV1('hutang') + ' h ' +
    'LEFT JOIN ' + auditSupplierHutangQuoteIdentifierV1('itemhutang') + ' ih ' +
    'ON ih.kode = h.kode ' +
    'LEFT JOIN ' + auditSupplierHutangQuoteIdentifierV1('pembelian') + ' p ' +
    'ON p.kode = ih.kode_hutang ' +
    'WHERE h.kode IN (' +
    "'R32-250621003','R32-290621004','R32-010721005'" +
    ') ' +
    'ORDER BY h.kode';

  Logger.log('====================================================');
  Logger.log('SUPPLIER HUTANG TRACE V1');
  Logger.log('MODE: READ-ONLY');
  Logger.log('QUERY: 1 targeted JOIN');
  Logger.log('====================================================');
  Logger.log('QUERY: ' + sql);

  try {
    const response = sidRetailQuery(sql);

    const rows =
      response && Array.isArray(response.data)
        ? response.data
        : [];

    Logger.log('ROWS: ' + rows.length);
    Logger.log(JSON.stringify(rows));

    const result = {
      diagnostic: 'supplier_hutang_trace_v1',
      read_only: true,
      query_count: 1,
      row_count: rows.length,
      rows: rows,
      duration_ms: Date.now() - started
    };

    Logger.log('DURATION MS: ' + result.duration_ms);
    Logger.log('====================================================');

    return result;
  } catch (error) {
    const message =
      error && error.message
        ? error.message
        : String(error);

    Logger.log('TRACE ERROR: ' + message);
    Logger.log('====================================================');

    return {
      diagnostic: 'supplier_hutang_trace_v1',
      read_only: true,
      query_count: 1,
      success: false,
      error: message,
      duration_ms: Date.now() - started
    };
  }
}


/**
 * Discovery hanya terhadap kandidat tabel Hutang Supplier.
 */
function auditSupplierHutangDiscoverTablesV1() {
  Logger.log('--- DISCOVERY TABLE SUPPLIER HUTANG ---');

  let discovered = [];

  try {
    const result = sidRetailQuery('SHOW TABLES');

    if (result && Array.isArray(result.data)) {
      const availableTables = result.data
        .map(function(row) {
          const keys = Object.keys(row || {});
          if (!keys.length) return '';

          const value = row[keys[0]];
          return value === null || value === undefined
            ? ''
            : String(value).trim();
        })
        .filter(Boolean);

      discovered =
        SUPPLIER_HUTANG_AUDIT_V1_CONFIG.candidateTables.filter(
          function(tableName) {
            return availableTables.indexOf(tableName) !== -1;
          }
        );

      Logger.log(
        'SHOW TABLES BERHASIL: ' +
        availableTables.length +
        ' total tabel | ' +
        discovered.length +
        ' tabel relevan.'
      );
    }
  } catch (error) {
    Logger.log(
      'SHOW TABLES GAGAL: ' +
      (error && error.message ? error.message : error)
    );
  }

  SUPPLIER_HUTANG_AUDIT_V1_CONFIG.candidateTables.forEach(
    function(tableName) {
      if (discovered.indexOf(tableName) !== -1) return;

      try {
        const result = sidRetailQuery(
          'SELECT * FROM ' +
          auditSupplierHutangQuoteIdentifierV1(tableName) +
          ' LIMIT ' +
          SUPPLIER_HUTANG_AUDIT_V1_CONFIG.sampleLimit
        );

        if (result && result.status === 'success') {
          discovered.push(tableName);
          Logger.log('TABLE TERDETEKSI: ' + tableName);
        }
      } catch (error) {
        // Kandidat boleh memang tidak ada pada instalasi SID Retail.
      }
    }
  );

  discovered = discovered
    .filter(function(value, index, array) {
      return array.indexOf(value) === index;
    })
    .sort();

  return {
    tables: discovered,
    method: 'SHOW TABLES + SAFE CANDIDATE FALLBACK'
  };
}


/**
 * Audit struktur satu tabel.
 * SHOW COLUMNS adalah jalur utama.
 * SELECT * LIMIT adalah fallback.
 */
function auditSupplierHutangStructureV1(tableName) {
  const safeTable = auditSupplierHutangValidateIdentifierV1(tableName);

  try {
    const result = sidRetailQuery(
      'SHOW COLUMNS FROM ' +
      auditSupplierHutangQuoteIdentifierV1(safeTable)
    );

    const rows = Array.isArray(result.data) ? result.data : [];

    if (rows.length) {
      return {
        table: safeTable,
        exists: true,
        method: 'SHOW COLUMNS',
        columns: rows.map(function(row) {
          return {
            field: auditSupplierHutangPickFieldV1(
              row,
              ['Field', 'field', 'COLUMN_NAME', 'column_name']
            ),
            type: auditSupplierHutangPickFieldV1(
              row,
              ['Type', 'type', 'DATA_TYPE', 'data_type']
            ),
            nullability: auditSupplierHutangPickFieldV1(
              row,
              ['Null', 'null', 'IS_NULLABLE', 'is_nullable']
            ),
            key: auditSupplierHutangPickFieldV1(
              row,
              ['Key', 'key', 'COLUMN_KEY', 'column_key']
            )
          };
        })
      };
    }
  } catch (error) {
    Logger.log(
      'SHOW COLUMNS GAGAL: ' +
      safeTable +
      ' | ' +
      (error && error.message ? error.message : error)
    );
  }

  try {
    const result = sidRetailQuery(
      'SELECT * FROM ' +
      auditSupplierHutangQuoteIdentifierV1(safeTable) +
      ' LIMIT ' +
      SUPPLIER_HUTANG_AUDIT_V1_CONFIG.sampleLimit
    );

    const rows = Array.isArray(result.data) ? result.data : [];
    const columns = rows.length ? Object.keys(rows[0]) : [];

    return {
      table: safeTable,
      exists: true,
      method:
        'SELECT * LIMIT ' +
        SUPPLIER_HUTANG_AUDIT_V1_CONFIG.sampleLimit,
      columns: columns.map(function(field) {
        return {
          field: field,
          type: 'UNKNOWN'
        };
      })
    };
  } catch (error) {
    return {
      table: safeTable,
      exists: false,
      error:
        error && error.message
          ? error.message
          : String(error)
    };
  }
}


/**
 * Sample kecil untuk melihat bentuk data nyata.
 */
function auditSupplierHutangSampleV1(tableName) {
  const safeTable = auditSupplierHutangValidateIdentifierV1(tableName);

  try {
    const result = sidRetailQuery(
      'SELECT * FROM ' +
      auditSupplierHutangQuoteIdentifierV1(safeTable) +
      ' LIMIT ' +
      SUPPLIER_HUTANG_AUDIT_V1_CONFIG.sampleLimit
    );

    const rows = Array.isArray(result.data) ? result.data : [];

    return {
      table: safeTable,
      success: true,
      row_count: rows.length,
      columns: rows.length ? Object.keys(rows[0]) : [],
      rows: rows
    };
  } catch (error) {
    return {
      table: safeTable,
      success: false,
      error:
        error && error.message
          ? error.message
          : String(error)
    };
  }
}


/**
 * Klasifikasi field untuk mempermudah audit manusia.
 * Ini hanya kandidat, bukan keputusan source of truth.
 */
function auditSupplierHutangClassifyFieldsV1(structures) {
  const result = {
    supplier_fields: [],
    financial_fields: [],
    date_fields: [],
    possible_identity_fields: [],
    all_fields: []
  };

  structures.forEach(function(structure) {
    if (!structure || !structure.exists) return;

    (structure.columns || []).forEach(function(column) {
      const field = String(column.field || '').trim();
      if (!field) return;

      const normalized = field.toLowerCase();

      const item = {
        table: structure.table,
        field: field,
        type: column.type || 'UNKNOWN'
      };

      result.all_fields.push(item);

      if (
        SUPPLIER_HUTANG_AUDIT_V1_CONFIG.supplierKeywords.some(
          function(keyword) {
            return normalized.indexOf(keyword) !== -1;
          }
        )
      ) {
        result.supplier_fields.push(item);
      }

      if (
        SUPPLIER_HUTANG_AUDIT_V1_CONFIG.financialKeywords.some(
          function(keyword) {
            return normalized.indexOf(keyword) !== -1;
          }
        )
      ) {
        result.financial_fields.push(item);
      }

      if (
        SUPPLIER_HUTANG_AUDIT_V1_CONFIG.dateKeywords.some(
          function(keyword) {
            return normalized.indexOf(keyword) !== -1;
          }
        )
      ) {
        result.date_fields.push(item);
      }

      if (
        SUPPLIER_HUTANG_AUDIT_V1_CONFIG.identityKeywords.some(
          function(keyword) {
            return normalized.indexOf(keyword) !== -1;
          }
        )
      ) {
        result.possible_identity_fields.push(item);
      }
    });
  });

  return result;
}


/**
 * Petunjuk relasi yang mungkin dipakai tahap validasi berikutnya.
 */
function auditSupplierHutangRelationshipHintsV1(structures) {
  const result = {
    supplier_identity: [],
    nota_identity: [],
    payment_identity: [],
    financial_candidates: []
  };

  structures.forEach(function(structure) {
    if (!structure || !structure.exists) return;

    (structure.columns || []).forEach(function(column) {
      const field = String(column.field || '').trim();
      if (!field) return;

      const normalized = field.toLowerCase();
      const item = {
        table: structure.table,
        field: field,
        type: column.type || 'UNKNOWN'
      };

      if (
        normalized.indexOf('supplier') !== -1 ||
        normalized.indexOf('pemasok') !== -1
      ) {
        result.supplier_identity.push(item);
      }

      if (
        normalized.indexOf('nota') !== -1 ||
        normalized.indexOf('faktur') !== -1 ||
        normalized.indexOf('invoice') !== -1
      ) {
        result.nota_identity.push(item);
      }

      if (
        normalized.indexOf('bayar') !== -1 ||
        normalized.indexOf('pembayaran') !== -1
      ) {
        result.payment_identity.push(item);
      }

      if (
        SUPPLIER_HUTANG_AUDIT_V1_CONFIG.financialKeywords.some(
          function(keyword) {
            return normalized.indexOf(keyword) !== -1;
          }
        )
      ) {
        result.financial_candidates.push(item);
      }
    });
  });

  return result;
}


function auditSupplierHutangQuoteIdentifierV1(value) {
  return (
    String.fromCharCode(96) +
    auditSupplierHutangValidateIdentifierV1(value) +
    String.fromCharCode(96)
  );
}


function auditSupplierHutangValidateIdentifierV1(value) {
  const text = String(value || '').trim();

  if (!/^[A-Za-z0-9_]+$/.test(text)) {
    throw new Error('Identifier tabel tidak valid: ' + text);
  }

  return text;
}


function auditSupplierHutangPickFieldV1(row, candidates) {
  if (!row) return '';

  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i];

    if (
      Object.prototype.hasOwnProperty.call(row, key) &&
      row[key] !== null &&
      row[key] !== undefined
    ) {
      return String(row[key]);
    }
  }

  return '';
}


/**
 * VALIDASI SISA NOTA V1
 * ------------------------------------------------------------
 * Audit sangat terfokus terhadap dua nota supplier FULLMOON yang
 * sudah terbukti memiliki relasi pembelian -> itemhutang.
 *
 * Tujuan:
 *   Membandingkan:
 *     - total nota pembelian
 *     - total alokasi pembayaran dari itemhutang.jumlah
 *     - itemhutang.return sebagai kandidat pengurang
 *     - sisa diagnostik
 *
 * CATATAN PENTING:
 *   sisa_diagnostic BUKAN source of truth dan belum boleh dipakai
 *   untuk halaman Hutang produksi. Ini hanya alat untuk menguji
 *   apakah struktur data mendukung rumus sisa yang sedang diaudit.
 *
 * Beban:
 *   - tepat 1 query
 *   - hanya 2 nota yang sudah diketahui
 *   - tidak scan seluruh tabel
 *   - read-only
 */
function auditSupplierHutangBalanceProbeV1() {
  const started = Date.now();

  const invoiceCodes = [
    'R21-260621001',
    'R21-260621002'
  ];

  const sql =
    'SELECT ' +
    'p.kode AS nota, ' +
    'p.tanggal AS tanggal, ' +
    'p.supplier AS supplier, ' +
    'p.jumlah AS total_nota, ' +
    'COALESCE(SUM(ih.jumlah), 0) AS total_alokasi_bayar, ' +
    'COALESCE(SUM(ih.return), 0) AS total_return_itemhutang, ' +
    'p.jumlah - COALESCE(SUM(ih.jumlah), 0) - COALESCE(SUM(ih.return), 0) AS sisa_diagnostic ' +
    'FROM ' + auditSupplierHutangQuoteIdentifierV1('pembelian') + ' p ' +
    'LEFT JOIN ' + auditSupplierHutangQuoteIdentifierV1('itemhutang') + ' ih ' +
    'ON ih.kode_hutang = p.kode ' +
    'WHERE p.kode IN (' +
    "'R21-260621001','R21-260621002'" +
    ') ' +
    'GROUP BY p.kode, p.tanggal, p.supplier, p.jumlah ' +
    'ORDER BY p.kode';

  Logger.log('====================================================');
  Logger.log('SUPPLIER HUTANG BALANCE PROBE V1');
  Logger.log('MODE: READ-ONLY');
  Logger.log('QUERY: 1 targeted aggregate');
  Logger.log('NOTA: ' + JSON.stringify(invoiceCodes));
  Logger.log('====================================================');
  Logger.log('QUERY: ' + sql);

  try {
    const response = sidRetailQuery(sql);

    const rows =
      response && Array.isArray(response.data)
        ? response.data
        : [];

    Logger.log('ROWS: ' + rows.length);
    Logger.log(JSON.stringify(rows));

    const result = {
      diagnostic: 'supplier_hutang_balance_probe_v1',
      read_only: true,
      query_count: 1,
      invoice_codes: invoiceCodes,
      row_count: rows.length,
      rows: rows,
      duration_ms: Date.now() - started
    };

    Logger.log('DURATION MS: ' + result.duration_ms);
    Logger.log('====================================================');

    return result;
  } catch (error) {
    const message =
      error && error.message
        ? error.message
        : String(error);

    Logger.log('BALANCE PROBE ERROR: ' + message);
    Logger.log('====================================================');

    return {
      diagnostic: 'supplier_hutang_balance_probe_v1',
      read_only: true,
      query_count: 1,
      invoice_codes: invoiceCodes,
      success: false,
      error: message,
      duration_ms: Date.now() - started
    };
  }
}


/**
 * CARI NOTA DENGAN SISA HUTANG V1
 * ------------------------------------------------------------
 * Audit terfokus untuk menemukan contoh nota yang:
 *   0 < total alokasi pembayaran < total nota
 *
 * Tujuan:
 *   Mendapatkan SATU contoh nyata nota yang masih bersaldo.
 *
 * Beban:
 *   - 1 query
 *   - hanya pembelian yang berstatus hutang_ke supplier
 *   - dibatasi hasil maksimal 10 nota
 *   - tidak mengubah data
 *
 * CATATAN:
 *   Nilai sisa di sini masih "diagnostic".
 *   Belum menjadi source of truth produksi.
 */
function auditSupplierHutangFindOutstandingV1() {
  const started = Date.now();

  const sql =
    'SELECT ' +
    'p.kode AS nota, ' +
    'p.tanggal AS tanggal, ' +
    'p.supplier AS supplier, ' +
    'p.jumlah AS total_nota, ' +
    'COALESCE(SUM(ih.jumlah), 0) AS total_alokasi_bayar, ' +
    'p.jumlah - COALESCE(SUM(ih.jumlah), 0) AS sisa_diagnostic ' +
    'FROM ' + auditSupplierHutangQuoteIdentifierV1('pembelian') + ' p ' +
    'LEFT JOIN ' + auditSupplierHutangQuoteIdentifierV1('itemhutang') + ' ih ' +
    'ON ih.kode_hutang = p.kode ' +
    'WHERE p.hutang_ke = \'supplier\' ' +
    'GROUP BY p.kode, p.tanggal, p.supplier, p.jumlah ' +
    'HAVING p.jumlah > COALESCE(SUM(ih.jumlah), 0) ' +
    'AND COALESCE(SUM(ih.jumlah), 0) > 0 ' +
    'ORDER BY p.tanggal DESC ' +
    'LIMIT 10';

  Logger.log('====================================================');
  Logger.log('SUPPLIER HUTANG FIND OUTSTANDING V1');
  Logger.log('MODE: READ-ONLY');
  Logger.log('QUERY: 1 targeted aggregate');
  Logger.log('====================================================');
  Logger.log('QUERY: ' + sql);

  try {
    const response = sidRetailQuery(sql);

    const rows =
      response && Array.isArray(response.data)
        ? response.data
        : [];

    Logger.log('ROWS: ' + rows.length);
    Logger.log(JSON.stringify(rows));

    const result = {
      diagnostic: 'supplier_hutang_find_outstanding_v1',
      read_only: true,
      query_count: 1,
      row_count: rows.length,
      rows: rows,
      duration_ms: Date.now() - started
    };

    Logger.log('DURATION MS: ' + result.duration_ms);
    Logger.log('====================================================');

    return result;
  } catch (error) {
    const message =
      error && error.message
        ? error.message
          : String(error);

    Logger.log('OUTSTANDING SEARCH ERROR: ' + message);
    Logger.log('====================================================');

    return {
      diagnostic: 'supplier_hutang_find_outstanding_v1',
      read_only: true,
      query_count: 1,
      success: false,
      error: message,
      duration_ms: Date.now() - started
    };
  }
}


/**
 * PROBE PEMBELIAN TERBARU V1
 * ------------------------------------------------------------
 * Tahap discovery ringan setelah aggregate seluruh pembelian
 * mengalami timeout 504.
 *
 * Tujuan:
 *   Mengambil sejumlah kecil nota pembelian terbaru untuk memilih
 *   kandidat yang kemudian dapat ditrace secara targeted.
 *
 * Beban:
 *   - 1 query
 *   - SELECT field yang diperlukan saja
 *   - LIMIT 20
 *   - tanpa JOIN
 *   - tanpa aggregate
 *   - tanpa scan itemhutang
 *   - read-only
 *
 * CATATAN:
 *   Hasil probe hanya kandidat. Jangan menganggap p.hutang,
 *   p.lunas, atau field lain sebagai source of truth saldo sebelum
 *   ditrace terhadap struktur pembayaran.
 */
function auditSupplierHutangRecentPurchasesV1() {
  const started = Date.now();

  const sql =
    'SELECT ' +
    'p.kode AS nota, ' +
    'p.tanggal AS tanggal, ' +
    'p.supplier AS supplier, ' +
    'p.jumlah AS total_nota, ' +
    'p.hutang AS hutang_field, ' +
    'p.lunas AS lunas, ' +
    'p.kekurangan_sdh_dibayar AS kekurangan_sdh_dibayar, ' +
    'p.hutang_ke AS hutang_ke ' +
    'FROM ' + auditSupplierHutangQuoteIdentifierV1('pembelian') + ' p ' +
    'WHERE p.hutang_ke = \'supplier\' ' +
    'ORDER BY p.tanggal DESC ' +
    'LIMIT 20';

  Logger.log('====================================================');
  Logger.log('SUPPLIER HUTANG RECENT PURCHASE PROBE V1');
  Logger.log('MODE: READ-ONLY');
  Logger.log('QUERY: 1 lightweight SELECT');
  Logger.log('LIMIT: 20');
  Logger.log('====================================================');
  Logger.log('QUERY: ' + sql);

  try {
    const response = sidRetailQuery(sql);

    const rows =
      response && Array.isArray(response.data)
        ? response.data
        : [];

    Logger.log('ROWS: ' + rows.length);
    Logger.log(JSON.stringify(rows));

    const result = {
      diagnostic: 'supplier_hutang_recent_purchases_v1',
      read_only: true,
      query_count: 1,
      limit: 20,
      row_count: rows.length,
      rows: rows,
      duration_ms: Date.now() - started
    };

    Logger.log('DURATION MS: ' + result.duration_ms);
    Logger.log('====================================================');

    return result;
  } catch (error) {
    const message =
      error && error.message
        ? error.message
        : String(error);

    Logger.log('RECENT PURCHASE PROBE ERROR: ' + message);
    Logger.log('====================================================');

    return {
      diagnostic: 'supplier_hutang_recent_purchases_v1',
      read_only: true,
      query_count: 1,
      limit: 20,
      success: false,
      error: message,
      duration_ms: Date.now() - started
    };
  }
}
