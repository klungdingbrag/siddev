/**
 * DIAGNOSTIK PDF DETAIL PIUTANG -> GOOGLE DRIVE (READ ONLY)
 *
 * Khusus pelanggan 2607024. Ini file diagnostik terpisah; tidak mengubah
 * endpoint API maupun generator PDF produksi.
 *
 * Proses dijalankan manual dari editor Apps Script dengan fungsi:
 *   runDiagnosticPdfPiutang2607024ToPrivateDrive
 *
 * Setiap pemanggilan memproses maksimal 10 nota dan menyimpan checkpoint
 * data sementara sebagai JSON di folder Drive privat. Jalankan fungsi yang
 * sama berulang sampai log menunjukkan READY_TO_RENDER, lalu jalankan lagi
 * untuk merender dan menyimpan SATU PDF UTUH.
 *
 * Jika eksekusi terhenti saat satu batch, cursor belum maju sehingga batch
 * itu dapat diulang; SID hanya dibaca. Tidak ada PDF per batch/subtotal.
 */

function runDiagnosticPdfPiutang2607024ToPrivateDrive() {
  var customerCode = '2607024';
  var startedAt = Date.now();
  var manifest = pdfPiutangDiagnosticLoadManifest_();

  if (!manifest) {
    manifest = pdfPiutangDiagnosticStart_(customerCode);
  }

  if (manifest.status === 'completed') {
    Logger.log('DIAGNOSTIK SUDAH SELESAI | PDF: %s', manifest.pdf_file_url);
    return manifest;
  }

  if (manifest.status === 'collecting') {
    manifest = pdfPiutangDiagnosticProcessNextBatch_(manifest);
    Logger.log(
      'PROGRES: %s/%s nota | DURASI EKSEKUSI INI: %s ms | STATUS: %s',
      manifest.cursor,
      manifest.summary.count,
      Date.now() - startedAt,
      manifest.status
    );
    if (manifest.status === 'ready_to_render') {
      Logger.log('Semua data siap. Jalankan fungsi ini sekali lagi untuk membuat satu PDF utuh.');
    }
    return manifest;
  }

  if (manifest.status === 'ready_to_render') {
    manifest = pdfPiutangDiagnosticFinalize_(manifest);
    Logger.log(
      'PDF SELESAI | DURASI EKSEKUSI INI: %s ms | URL: %s',
      Date.now() - startedAt,
      manifest.pdf_file_url
    );
    return manifest;
  }

  throw new Error('Status diagnostik tidak dikenal: ' + manifest.status);
}

function pdfPiutangDiagnosticStart_(customerCode) {
  var started = Date.now();
  Logger.log('===== MEMULAI DIAGNOSTIK PIUTANG 2607024 =====');
  Logger.log('MODE: READ ONLY SID | PDF AKHIR: SATU FILE UTUH | DRIVE: PRIVAT');

  var summaryStarted = Date.now();
  var summary = getRingkasanPiutangPelanggan(customerCode);
  var summaryMs = Date.now() - summaryStarted;

  if (!summary || summary.status !== 'success' || !Array.isArray(summary.data)) {
    throw new Error('Ringkasan piutang tidak berhasil dibaca.');
  }

  Logger.log(
    'TAHAP RINGKASAN: %s ms | NOTA=%s | TOTAL OUTSTANDING=%s',
    summaryMs,
    summary.count,
    summary.total_outstanding
  );

  var folder = getOrCreatePrivatePdfPiutangDiagnosticFolder_();
  var manifest = {
    version: 1,
    status: summary.data.length ? 'collecting' : 'ready_to_render',
    kode_pelanggan: customerCode,
    created_at: new Date().toISOString(),
    summary_ms: summaryMs,
    summary: summary,
    cursor: 0,
    batch_files: [],
    folder_id: folder.getId()
  };

  var manifestFile = folder.createFile(
    'diagnostic_2607024_manifest.json',
    JSON.stringify(manifest),
    MimeType.PLAIN_TEXT
  );
  PropertiesService.getScriptProperties().setProperty(
    'PIUTANG_PDF_DIAGNOSTIC_2607024_MANIFEST_ID',
    manifestFile.getId()
  );

  Logger.log(
    'CHECKPOINT DIMULAI | FOLDER PRIVAT: %s | DURASI AWAL: %s ms',
    folder.getUrl(),
    Date.now() - started
  );
  return manifest;
}

function pdfPiutangDiagnosticProcessNextBatch_(manifest) {
  var batchSize = 10;
  var startIndex = Number(manifest.cursor || 0);
  var endIndex = Math.min(startIndex + batchSize, manifest.summary.data.length);
  var batchStarted = Date.now();
  var invoices = [];

  Logger.log(
    'MULAI BATCH NOTA %s-%s DARI %s',
    startIndex + 1,
    endIndex,
    manifest.summary.data.length
  );

  for (var index = startIndex; index < endIndex; index++) {
    var row = manifest.summary.data[index];
    var noteCode = validateStage6TransactionCode_(row.kode_transaksi);
    var noteStarted = Date.now();
    var note = getNotaTransaksiUntukPiutangPdf(noteCode);
    var noteMs = Date.now() - noteStarted;

    if (!note || note.status !== 'success') {
      throw new Error('Detail nota urutan ' + (index + 1) + ' gagal dibaca.');
    }
    if (!note.summary || Number(note.summary.piutang) <= 0) {
      throw new Error('Nota urutan ' + (index + 1) + ' tidak lagi outstanding.');
    }

    invoices.push(note);
    Logger.log(
      'NOTA %s/%s: %s ms | ITEM=%s',
      index + 1,
      manifest.summary.data.length,
      noteMs,
      Array.isArray(note.items) ? note.items.length : 0
    );
  }

  var folder = DriveApp.getFolderById(manifest.folder_id);
  var batchNumber = manifest.batch_files.length + 1;
  var batchName =
    'diagnostic_2607024_batch_' + String(batchNumber).padStart(3, '0') + '.json';
  var batchFile = folder.createFile(
    batchName,
    JSON.stringify({ invoices: invoices }),
    MimeType.PLAIN_TEXT
  );

  manifest.batch_files.push({
    file_id: batchFile.getId(),
    invoice_count: invoices.length
  });
  manifest.cursor = endIndex;
  manifest.status = endIndex >= manifest.summary.data.length
    ? 'ready_to_render'
    : 'collecting';
  manifest.updated_at = new Date().toISOString();

  pdfPiutangDiagnosticSaveManifest_(manifest);

  Logger.log(
    'BATCH CHECKPOINT TERSIMPAN: %s ms | NOTA BATCH=%s | PROGRES=%s/%s | STATUS=%s',
    Date.now() - batchStarted,
    invoices.length,
    manifest.cursor,
    manifest.summary.data.length,
    manifest.status
  );
  return manifest;
}

function pdfPiutangDiagnosticFinalize_(manifest) {
  var started = Date.now();
  var invoices = [];

  manifest.batch_files.forEach(function(batchRef) {
    var batchFile = DriveApp.getFileById(batchRef.file_id);
    var batchData = JSON.parse(batchFile.getBlob().getDataAsString());
    if (!batchData || !Array.isArray(batchData.invoices)) {
      throw new Error('Checkpoint batch tidak valid: ' + batchFile.getName());
    }
    invoices = invoices.concat(batchData.invoices);
  });

  if (invoices.length !== Number(manifest.summary.count)) {
    throw new Error(
      'Jumlah nota checkpoint tidak cocok. Ringkasan=' +
      manifest.summary.count + ', detail=' + invoices.length
    );
  }

  var detailOutstanding = invoices.reduce(function(total, note) {
    return total + Number(note.summary.piutang || 0);
  }, 0);
  var difference =
    detailOutstanding - Number(manifest.summary.total_outstanding || 0);

  if (Math.abs(difference) > 0.01) {
    throw new Error(
      'Rekonsiliasi gagal: ringkasan=' +
      manifest.summary.total_outstanding +
      ', detail=' + detailOutstanding +
      ', selisih=' + difference
    );
  }

  Logger.log(
    'REKONSILIASI: NOTA=%s | OUTSTANDING=%s | SELISIH=%s',
    invoices.length,
    detailOutstanding,
    difference
  );

  var reportStarted = Date.now();
  var report = stage6d2BuildReportHtml_({
    status: 'success',
    generated_at: new Date().toISOString(),
    kode_pelanggan: manifest.kode_pelanggan,
    nama_pelanggan: manifest.summary.nama_pelanggan,
    telp: manifest.summary.telp,
    alamat: manifest.summary.alamat,
    count: invoices.length,
    total_outstanding: detailOutstanding,
    ringkasan: manifest.summary.data,
    invoices: invoices
  });
  var reportBuildMs = Date.now() - reportStarted;

  Logger.log(
    'TAHAP HTML + LOGO: %s ms | PANJANG HTML=%s | NOTA=%s',
    reportBuildMs,
    report.html.length,
    report.invoice_count
  );

  var pdfStarted = Date.now();
  var timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyyMMdd_HHmmss'
  );
  var fileName =
    'Laporan_Detail_Piutang_2607024_DIAGNOSTIK_' + timestamp + '.pdf';
  var pdfBlob = HtmlService
    .createHtmlOutput(report.html)
    .getBlob()
    .getAs(MimeType.PDF)
    .setName(fileName);
  var pdfBytes = pdfBlob.getBytes();
  validateGeneratedPdfBytes_(pdfBytes, 'PDF diagnostik 6D.2');
  var pdfRenderMs = Date.now() - pdfStarted;

  Logger.log(
    'TAHAP RENDER + VALIDASI PDF: %s ms | UKURAN=%s byte',
    pdfRenderMs,
    pdfBytes.length
  );

  var driveStarted = Date.now();
  var folder = DriveApp.getFolderById(manifest.folder_id);
  var pdfFile = folder.createFile(pdfBlob);
  var driveSaveMs = Date.now() - driveStarted;

  manifest.status = 'completed';
  manifest.completed_at = new Date().toISOString();
  manifest.pdf_file_id = pdfFile.getId();
  manifest.pdf_file_url = pdfFile.getUrl();
  manifest.pdf_file_name = pdfFile.getName();
  manifest.pdf_size_bytes = pdfBytes.length;
  manifest.validation = {
    invoice_count: invoices.length,
    total_outstanding: detailOutstanding,
    difference: difference
  };
  manifest.final_timings_ms = {
    html_and_logo: reportBuildMs,
    pdf_render_and_validate: pdfRenderMs,
    drive_save: driveSaveMs,
    total_finalize: Date.now() - started
  };

  pdfPiutangDiagnosticSaveManifest_(manifest);

  Logger.log(
    'TAHAP SIMPAN DRIVE: %s ms | FILE=%s',
    driveSaveMs,
    pdfFile.getName()
  );
  Logger.log('PDF PRIVAT: %s', pdfFile.getUrl());
  Logger.log(
    'TOTAL AKHIR: %s ms | VALIDASI SALDO: %s',
    Date.now() - started,
    difference
  );
  return manifest;
}

function pdfPiutangDiagnosticLoadManifest_() {
  var fileId = PropertiesService.getScriptProperties().getProperty(
    'PIUTANG_PDF_DIAGNOSTIC_2607024_MANIFEST_ID'
  );
  if (!fileId) return null;

  var file = DriveApp.getFileById(fileId);
  return JSON.parse(file.getBlob().getDataAsString());
}

function pdfPiutangDiagnosticSaveManifest_(manifest) {
  var fileId = PropertiesService.getScriptProperties().getProperty(
    'PIUTANG_PDF_DIAGNOSTIC_2607024_MANIFEST_ID'
  );
  if (!fileId) {
    throw new Error('Manifest ID diagnostik tidak ditemukan di Script Properties.');
  }

  DriveApp.getFileById(fileId).setContent(JSON.stringify(manifest));
}

function getOrCreatePrivatePdfPiutangDiagnosticFolder_() {
  var propertyName = 'PIUTANG_PDF_DIAGNOSTIC_PRIVATE_FOLDER_ID';
  var properties = PropertiesService.getScriptProperties();
  var folderId = properties.getProperty(propertyName);

  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (error) {
      Logger.log('Folder diagnostik tersimpan tidak dapat diakses; membuat folder baru.');
    }
  }

  var folder = DriveApp.createFolder('Diagnostik PDF Piutang - Privat');
  properties.setProperty(propertyName, folder.getId());
  return folder;
}
