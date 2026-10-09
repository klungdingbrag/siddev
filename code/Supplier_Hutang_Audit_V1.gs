/**
 * TB NUSANTARA - SUPPLIER HUTANG AUDIT V1
 * ============================================================
 * READ-ONLY AUDIT MODULE
 *
 * Tujuan:
 *   Mengaudit struktur dan source of truth Hutang Supplier pada
 *   SID Retail sebelum membuat API/frontend Hutang.
 *
 * Prinsip:
 *   - TIDAK mengubah Code.gs.
 *   - TIDAK INSERT / UPDATE / DELETE.
 *   - TIDAK mengubah data SID Retail.
 *   - Modul ini hanya memakai sidRetailQuery() yang sudah ada.
 *   - Tidak membuat asumsi bahwa hutang = pembelian - pembayaran.
 *   - Hasil audit dipakai untuk menentukan source of truth yang valid.
 *
 * Tahap V1:
 *   1. Temukan tabel yang berkaitan dengan pembelian/supplier/pembayaran.
 *   2. Audit struktur tabel.
 *   3. Ambil sample kecil untuk melihat bentuk data nyata.
 *   4. Cari kandidat field finansial dan tanggal.
 *   5. Catat kandidat relasi untuk validasi tahap berikutnya.
 *
 * PENTING:
 *   File ini sengaja terpisah dari Code.gs agar audit tidak bercampur
 *   dengan fungsi production Piutang yang sudah stabil.
 * ============================================================
 */

const SUPPLIER_HUTANG_AUDIT_V1_CONFIG = Object.freeze({
  sampleLimit: 5,

  // Kandidat awal. Audit tidak menganggap semua tabel ini pasti ada.
  candidateTables: [
    'pembelian',
    'itempembelian',
    'supplier',
    'pemasok',
    'hutang',
    'hutang_supplier',
    'pembayaranpembelian',
    'pembayaran_pembelian',
    'bayarpembelian',
    'returpembelian',
    'itemreturpembelian',
    'return_pembelian',
    'header_return_pembelian',
    'item_return_beli_serial',
    'potong_hutang_return',
    'temp_item_hutang'
  ],

  supplierKeywords: ['supplier', 'pemasok', 'vendor'],

  financialKeywords: [
    'jumlah', 'total', 'harga', 'subtotal', 'bayar',
    'pembayaran', 'angsuran', 'hutang', 'saldo',
    'piutang', 'sisa', 'tagihan'
  ],

  dateKeywords: ['tanggal', 'tgl', 'date', 'jt', 'jatuh', 'tempo']
});


/**
 * ENTRY POINT UTAMA
 *
 * Jalankan fungsi ini terlebih dahulu dari Apps Script.
 * Semua query bersifat read-only.
 */
function auditSupplierHutangV1() {
  const started = Date.now();

  Logger.log('====================================================');
  Logger.log('SUPPLIER HUTANG AUDIT V1');
  Logger.log('MODE: READ-ONLY');
  Logger.log('====================================================');

  const tableDiscovery = auditSupplierHutangDiscoverTablesV1();
  const tableNames = tableDiscovery.tables;

  Logger.log('TABLE DISCOVERY: ' + JSON.stringify(tableNames));

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

  const result = {
    diagnostic: 'supplier_hutang_audit_v1',
    read_only: true,
    duration_ms: Date.now() - started,
    discovery: tableDiscovery,
    structures: structures,
    samples: samples,
    candidate_fields: candidateFields,
    next_step:
      'Validasi source of truth Hutang Supplier sebelum membuat API/frontend.'
  };

  Logger.log('====================================================');
  Logger.log('SUPPLIER HUTANG AUDIT V1 SELESAI');
  Logger.log('DURATION MS: ' + result.duration_ms);
  Logger.log('CANDIDATE FIELDS: ' + JSON.stringify(candidateFields));
  Logger.log('====================================================');

  return result;
}


/**
 * Audit tabel saja.
 */
function auditSupplierHutangDiscoverTablesV1() {
  Logger.log('--- DISCOVERY TABLE SUPPLIER HUTANG ---');

  let discovered = [];

  // Jalur utama: metadata SQL.
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

      // SHOW TABLES dapat mengembalikan ratusan tabel.
      // Hanya teruskan kandidat yang relevan agar audit tidak melakukan
      // ratusan query metadata/sample yang tidak diperlukan.
      discovered = SUPPLIER_HUTANG_AUDIT_V1_CONFIG.candidateTables.filter(
        function(tableName) {
          return availableTables.indexOf(tableName) !== -1;
        }
      );
    }

    Logger.log(
      'SHOW TABLES BERHASIL: ' +
      discovered.length +
      ' kandidat relevan ditemukan.'
    );
  } catch (error) {
    Logger.log(
      'SHOW TABLES TIDAK TERSEDIA/GAGAL: ' +
      (error && error.message ? error.message : error)
    );
  }

  // Fallback aman: cek kandidat satu per satu dengan LIMIT kecil.
  const candidates = SUPPLIER_HUTANG_AUDIT_V1_CONFIG.candidateTables;

  candidates.forEach(function(tableName) {
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
      Logger.log(
        'TABLE TIDAK TERDETEKSI: ' +
        tableName +
        ' | ' +
        (error && error.message ? error.message : error)
      );
    }
  });

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
 *
 * Jalur pertama: SHOW COLUMNS.
 * Fallback: SELECT * LIMIT kecil.
 */
function auditSupplierHutangStructureV1(tableName) {
  const safeTable = auditSupplierHutangValidateIdentifierV1(tableName);

  try {
    const result = sidRetailQuery(
      'SHOW COLUMNS FROM ' + auditSupplierHutangQuoteIdentifierV1(safeTable)
    );

    const rows = Array.isArray(result.data) ? result.data : [];

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
      method: 'SELECT * LIMIT ' + SUPPLIER_HUTANG_AUDIT_V1_CONFIG.sampleLimit,
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
      error: error && error.message
        ? error.message
        : String(error)
    };
  }
}


/**
 * Ambil sample kecil dari satu tabel.
 *
 * Tidak melakukan agregasi dan tidak mengambil seluruh tabel.
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
      error: error && error.message
        ? error.message
        : String(error)
    };
  }
}


/**
 * Klasifikasi kandidat field.
 *
 * Ini hanya membantu manusia membaca audit.
 * Fungsi ini TIDAK menetapkan source of truth.
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
        SUPPLIER_HUTANG_AUDIT_V1_CONFIG.supplierKeywords.some(function(keyword) {
          return normalized.indexOf(keyword) !== -1;
        })
      ) {
        result.supplier_fields.push(item);
      }

      if (
        SUPPLIER_HUTANG_AUDIT_V1_CONFIG.financialKeywords.some(function(keyword) {
          return normalized.indexOf(keyword) !== -1;
        })
      ) {
        result.financial_fields.push(item);
      }

      if (
        SUPPLIER_HUTANG_AUDIT_V1_CONFIG.dateKeywords.some(function(keyword) {
          return normalized.indexOf(keyword) !== -1;
        })
      ) {
        result.date_fields.push(item);
      }

      if (
        normalized.indexOf('kode') !== -1 ||
        normalized.indexOf('id') !== -1 ||
        normalized.indexOf('no_') === 0 ||
        normalized.indexOf('nomor') !== -1
      ) {
        result.possible_identity_fields.push(item);
      }
    });
  });

  return result;
}


/**
 * Quote identifier setelah divalidasi.
 * Input hanya identifier sederhana, bukan SQL bebas.
 */
function auditSupplierHutangQuoteIdentifierV1(value) {
  // MySQL identifier quoting: `table_name`.
  // Jangan bungkus identifier dengan single quote karena itu
  // mengubahnya menjadi string literal dan menyebabkan SQL syntax error.
  return String.fromCharCode(96) +
    auditSupplierHutangValidateIdentifierV1(value) +
    String.fromCharCode(96);
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
