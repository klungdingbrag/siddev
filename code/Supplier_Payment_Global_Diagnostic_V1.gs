/**
 * SID RETAIL — SUPPLIER PAYMENT GLOBAL DIAGNOSTIC V1
 * ============================================================
 * MODE: READ-ONLY
 *
 * Tujuan:
 *   Menginspeksi contoh record pada tabel kandidat pembayaran
 *   hutang supplier, tanpa mengubah data apa pun.
 *
 * Batasan:
 *   - Hanya SELECT * dengan LIMIT kecil.
 *   - Tidak INSERT / UPDATE / DELETE.
 *   - Tidak mengubah Code.gs atau fungsi yang sudah berjalan.
 *   - Nama tabel adalah kandidat dan hasil harus diverifikasi.
 *   - Jalankan hanya pada project GAS Development yang terhubung
 *     ke backend development.
 *
 * Cara menjalankan:
 *   diagnosticSupplierPaymentTablesV1()
 *
 * Fungsi sidRetailQuery() harus tersedia pada project GAS tempat
 * diagnosis dijalankan. Fungsi ini tidak didaftarkan sebagai endpoint
 * frontend dan tidak membuat transaksi pembayaran.
 * ============================================================
 */

function diagnosticSupplierPaymentTablesV1() {
  var tables = [
    'hutang',
    'itemhutang',
    'pembelian',
    'supplier',
    'return_pembelian',
    'potong_hutang_return'
  ];

  var result = {
    diagnostic: 'supplier_payment_tables_v1',
    mode: 'READ_ONLY',
    query_type: 'SELECT * LIMIT 3',
    started_at: new Date().toISOString(),
    tables: []
  };

  Logger.log('====================================================');
  Logger.log('SUPPLIER PAYMENT GLOBAL DIAGNOSTIC V1');
  Logger.log('MODE: READ-ONLY — NO DATA MUTATION');
  Logger.log('====================================================');

  tables.forEach(function(tableName) {
    try {
      // Table names come only from the fixed allowlist above.
      var response = sidRetailQuery(
        'SELECT * FROM ' + tableName + ' LIMIT 3'
      );

      var rows = response && Array.isArray(response.data)
        ? response.data
        : [];

      var tableResult = {
        table: tableName,
        api_status: response ? response.status : 'NO_RESPONSE',
        success: !!response && response.status === 'success',
        row_count: rows.length,
        columns: rows.length ? Object.keys(rows[0]) : [],
        sample_rows: rows
      };

      result.tables.push(tableResult);

      Logger.log('--- TABLE: ' + tableName + ' ---');
      Logger.log('API STATUS: ' + tableResult.api_status);
      Logger.log('ROW COUNT: ' + rows.length);
      Logger.log('COLUMNS: ' + JSON.stringify(tableResult.columns));
      Logger.log('SAMPLE ROWS: ' + JSON.stringify(rows));
    } catch (error) {
      var message = error && error.message
        ? error.message
        : String(error);

      result.tables.push({
        table: tableName,
        success: false,
        error: message
      });

      Logger.log('--- TABLE: ' + tableName + ' ---');
      Logger.log('ERROR: ' + message);
    }
  });

  result.duration_ms = Date.now() - new Date(result.started_at).getTime();

  Logger.log('====================================================');
  Logger.log('DIAGNOSTIC RESULT: ' + JSON.stringify(result));
  Logger.log('DURATION MS: ' + result.duration_ms);
  Logger.log('====================================================');

  return result;
}
