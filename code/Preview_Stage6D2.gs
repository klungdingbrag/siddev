/**
 * PREVIEW STAGE 6D.2 - V2
 * ============================================================
 * Tidak mengubah Stage6D2.
 *
 * Fungsi:
 *   testStage6D2PreviewV2()
 *
 * Tujuan:
 *   Mengambil PDF dari Stage6D2,
 *   memvalidasi Base64,
 *   membuat Blob,
 *   lalu menyimpan preview ke Google Drive.
 * ============================================================
 */

function testStage6D2PreviewV2() {
  const kodePelanggan = '2102029';

  Logger.log('==============================================');
  Logger.log('TB NUSANTARA - PREVIEW TAHAP 6D.2 V2');
  Logger.log('==============================================');
  Logger.log('PELANGGAN : ' + kodePelanggan);

  // ==========================================================
  // 1. GENERATE PDF DARI STAGE 6D.2
  // ==========================================================

  const result = getPdfSemuaDetailPiutang_6D2(kodePelanggan);

  if (!result) {
    throw new Error('Result Stage6D2 kosong.');
  }

  Logger.log('STATUS       : ' + result.status);
  Logger.log('FILENAME     : ' + result.filename);
  Logger.log('MIME TYPE    : ' + result.mime_type);
  Logger.log('SIZE SOURCE  : ' + result.size_bytes);
  Logger.log('BASE64 LENGTH: ' +
    (result.pdf_base64 ? result.pdf_base64.length : 0)
  );

  if (result.status !== 'success') {
    throw new Error(
      'Stage6D2 gagal: ' + JSON.stringify(result)
    );
  }

  if (!result.pdf_base64) {
    throw new Error(
      'Stage6D2 tidak mengembalikan pdf_base64.'
    );
  }

  // ==========================================================
  // 2. DECODE BASE64
  // ==========================================================

  const decodedBytes =
    Utilities.base64Decode(result.pdf_base64);

  Logger.log('DECODED BYTES: ' + decodedBytes.length);

  if (!decodedBytes || decodedBytes.length === 0) {
    throw new Error(
      'Base64 berhasil diterima tetapi hasil decode = 0 bytes.'
    );
  }

  // ==========================================================
  // 3. BUAT BLOB PDF
  // ==========================================================

  const blob = Utilities.newBlob(
    decodedBytes,
    'application/pdf',
    result.filename ||
      ('Preview_6D2_' + kodePelanggan + '.pdf')
  );

  Logger.log('BLOB SIZE    : ' + blob.getBytes().length);
  Logger.log('BLOB TYPE    : ' + blob.getContentType());
  Logger.log('BLOB NAME    : ' + blob.getName());

  if (blob.getBytes().length === 0) {
    throw new Error(
      'Blob PDF = 0 bytes sebelum disimpan ke Drive.'
    );
  }

  // ==========================================================
  // 4. SIMPAN KE DRIVE
  // ==========================================================

  const file = DriveApp.createFile(blob);

  // ==========================================================
  // 5. REFRESH METADATA FILE
  // ==========================================================

  const savedSize = file.getSize();

  Logger.log('==============================================');
  Logger.log('PREVIEW PDF BERHASIL DIBUAT');
  Logger.log('FILE NAME : ' + file.getName());
  Logger.log('FILE ID   : ' + file.getId());
  Logger.log('FILE URL  : ' + file.getUrl());
  Logger.log('SIZE      : ' + savedSize + ' bytes');
  Logger.log('MIME TYPE : ' + file.getMimeType());
  Logger.log('==============================================');

  if (savedSize === 0) {
    throw new Error(
      'File berhasil dibuat tetapi SIZE = 0 bytes.'
    );
  }

  return {
    status: 'success',
    kode_pelanggan: kodePelanggan,
    filename: file.getName(),
    file_id: file.getId(),
    file_url: file.getUrl(),
    source_size_bytes: result.size_bytes,
    base64_length: result.pdf_base64.length,
    decoded_size_bytes: decodedBytes.length,
    blob_size_bytes: blob.getBytes().length,
    saved_size_bytes: savedSize,
    mime_type: file.getMimeType()
  };
}
