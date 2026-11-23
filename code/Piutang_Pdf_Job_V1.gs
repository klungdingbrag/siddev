/**
 * PIUTANG PDF JOB V1
 *
 * Mengambil detail nota dalam eksekusi GAS pendek, lalu menghasilkan satu PDF.
 * File JSON sementara dan PDF berada di Drive privat milik akun GAS.
 * File sementara dihapus setelah PDF selesai tersimpan.
 *
 * API yang memakai fungsi ini hanya menerima POST JSON.
 */

var PIUTANG_PDF_JOB_BATCH_SIZE = 8;
var PIUTANG_PDF_JOB_ROOT_PROPERTY = 'PIUTANG_PDF_JOB_ROOT_FOLDER_ID';

function startPiutangPdf6D2JobV1(kodePelanggan, requestId) {
  var kode = validateStage6CustomerCode_(kodePelanggan);
  var requestKey = String(requestId || '').trim();
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(requestKey)) {
    throw new Error('request_id tidak valid untuk membuat pekerjaan PDF.');
  }

  var lock = LockService.getUserLock();
  lock.waitLock(10000);
  try {
    var root = getPiutangPdfJobRootFolderV1_();
    var manifestName = 'piutang_pdf_job_' + requestKey + '.json';
    var existing = root.getFilesByName(manifestName);
    if (existing.hasNext()) {
      var existingFile = existing.next();
      var existingJob = JSON.parse(existingFile.getBlob().getDataAsString());
      if (String(existingJob.kode_pelanggan) !== kode) {
        throw new Error('request_id sudah digunakan untuk pelanggan berbeda.');
      }
      return piutangPdfJobPublicStateV1_(existingJob, existingFile.getId());
    }

    var started = Date.now();
    var summary = getRingkasanPiutangPelanggan(kode);
    if (!summary || summary.status !== 'success' || !Array.isArray(summary.data)) {
      throw new Error('Ringkasan piutang tidak berhasil dibaca.');
    }

    var jobFolder = root.createFolder('temporary_' + requestKey);
    var manifest = {
      type: 'piutang_pdf_6d2_job',
      version: 1,
      status: summary.data.length ? 'processing' : 'ready_to_render',
      request_id: requestKey,
      kode_pelanggan: kode,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      cursor: 0,
      total: summary.data.length,
      summary,
      batch_files: [],
      temp_folder_id: jobFolder.getId()
    };
    var manifestFile = root.createFile(
      manifestName,
      JSON.stringify(manifest),
      MimeType.PLAIN_TEXT
    );

    Logger.log(
      'PIUTANG PDF JOB START | JOB=%s | CUSTOMER=%s | NOTA=%s | SUMMARY_MS=%s',
      manifestFile.getId(),
      kode,
      summary.data.length,
      Date.now() - started
    );
    return piutangPdfJobPublicStateV1_(manifest, manifestFile.getId());
  } finally {
    lock.releaseLock();
  }
}

function processPiutangPdf6D2JobV1(jobId) {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(250)) {
    return { status: 'busy', retry_after_ms: 1500 };
  }

  try {
    var context = loadPiutangPdfJobManifestV1_(jobId);
    var manifest = context.manifest;
    var manifestFile = context.file;

    if (manifest.status === 'completed' || manifest.status === 'failed') {
      return piutangPdfJobPublicStateV1_(manifest, manifestFile.getId());
    }

    if (manifest.status === 'ready_to_render') {
      return finalizePiutangPdf6D2JobV1_(context);
    }

    if (manifest.status !== 'processing') {
      throw new Error('Status pekerjaan PDF tidak dikenal: ' + manifest.status);
    }

    var batchStarted = Date.now();
    var start = Number(manifest.cursor || 0);
    var end = Math.min(start + PIUTANG_PDF_JOB_BATCH_SIZE, manifest.total);
    var invoices = [];

    for (var index = start; index < end; index++) {
      var summaryRow = manifest.summary.data[index];
      var noteCode = validateStage6TransactionCode_(summaryRow.kode_transaksi);
      var noteStarted = Date.now();
      var note = getNotaTransaksiUntukPiutangPdf(noteCode);
      var noteMs = Date.now() - noteStarted;

      if (!note || note.status !== 'success' || !note.summary) {
        throw new Error('Detail nota urutan ' + (index + 1) + ' gagal dibaca.');
      }
      if (Number(note.summary.piutang) <= 0) {
        manifest.status = 'failed';
        manifest.error =
          'Saldo nota berubah selama proses. Muat ulang detail pelanggan dan mulai ulang laporan.';
        manifest.updated_at = new Date().toISOString();
        piutangPdfJobDiscardTemporaryFilesV1_(manifest);
        piutangPdfJobDiscardTemporaryFilesV1_(manifest);
        manifest.summary = null;
        savePiutangPdfJobManifestV1_(manifestFile, manifest);
        throw new Error(manifest.error);
      }

      var expected = Number(summaryRow.piutang || 0);
      var actual = Number(note.summary.piutang || 0);
      if (Math.abs(actual - expected) > 0.01) {
        manifest.status = 'failed';
        manifest.error =
          'Saldo salah satu nota berubah selama proses. Muat ulang detail pelanggan dan mulai ulang laporan.';
        manifest.updated_at = new Date().toISOString();
        manifest.summary = null;
        savePiutangPdfJobManifestV1_(manifestFile, manifest);
        throw new Error(manifest.error);
      }

      invoices.push(note);
      Logger.log(
        'PIUTANG PDF JOB NOTA %s/%s | %s ms | ITEM=%s',
        index + 1,
        manifest.total,
        noteMs,
        Array.isArray(note.items) ? note.items.length : 0
      );
    }

    if (invoices.length) {
      var tempFolder = DriveApp.getFolderById(manifest.temp_folder_id);
      var batchNumber = manifest.batch_files.length + 1;
      var batchFile = tempFolder.createFile(
        'batch_' + String(batchNumber).padStart(3, '0') + '.json',
        JSON.stringify({ invoices: invoices }),
        MimeType.PLAIN_TEXT
      );
      manifest.batch_files.push({
        file_id: batchFile.getId(),
        invoice_count: invoices.length
      });
    }

    manifest.cursor = end;
    manifest.status = end >= manifest.total ? 'ready_to_render' : 'processing';
    manifest.updated_at = new Date().toISOString();
    savePiutangPdfJobManifestV1_(manifestFile, manifest);

    Logger.log(
      'PIUTANG PDF JOB CHECKPOINT | JOB=%s | PROGRESS=%s/%s | BATCH_MS=%s',
      manifestFile.getId(),
      manifest.cursor,
      manifest.total,
      Date.now() - batchStarted
    );

    if (manifest.status === 'ready_to_render') {
      return piutangPdfJobPublicStateV1_(manifest, manifestFile.getId());
    }
    return piutangPdfJobPublicStateV1_(manifest, manifestFile.getId());
  } finally {
    lock.releaseLock();
  }
}

function getPiutangPdf6D2JobStatusV1(jobId) {
  var context = loadPiutangPdfJobManifestV1_(jobId);
  return piutangPdfJobPublicStateV1_(context.manifest, context.file.getId());
}

function finalizePiutangPdf6D2JobV1_(context) {
  var manifest = context.manifest;
  var manifestFile = context.file;
  var started = Date.now();
  var invoices = [];

  manifest.batch_files.forEach(function(batchRef) {
    var file = DriveApp.getFileById(batchRef.file_id);
    var batch = JSON.parse(file.getBlob().getDataAsString());
    if (!batch || !Array.isArray(batch.invoices)) {
      throw new Error('Data checkpoint PDF tidak valid.');
    }
    invoices = invoices.concat(batch.invoices);
  });

  if (invoices.length !== Number(manifest.total)) {
    throw new Error(
      'Jumlah nota checkpoint tidak cocok. Ringkasan=' +
      manifest.total + ', detail=' + invoices.length
    );
  }

  var detailOutstanding = invoices.reduce(function(total, note) {
    return total + Number(note.summary.piutang || 0);
  }, 0);
  var difference =
    detailOutstanding - Number(manifest.summary.total_outstanding || 0);
  if (Math.abs(difference) > 0.01) {
    throw new Error(
      'Rekonsiliasi PDF gagal. Ringkasan=' +
      manifest.summary.total_outstanding +
      ', detail=' + detailOutstanding
    );
  }

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
  var htmlMs = Date.now() - reportStarted;

  var fileName =
    'Laporan_Detail_Piutang_' + manifest.kode_pelanggan +
    '_' + manifest.request_id.slice(0, 8) + '.pdf';
  var root = getPiutangPdfJobRootFolderV1_();
  var existingPdfs = root.getFilesByName(fileName);
  var pdfFile;

  if (existingPdfs.hasNext()) {
    pdfFile = existingPdfs.next();
  } else {
    var pdfStarted = Date.now();
    var pdfBlob = HtmlService
      .createHtmlOutput(report.html)
      .getBlob()
      .getAs(MimeType.PDF)
      .setName(fileName);
    var pdfBytes = pdfBlob.getBytes();
    validateGeneratedPdfBytes_(pdfBytes, 'PDF Detail Piutang 6D.2');

    manifest.final_timings_ms = {
      html_and_logo: htmlMs,
      pdf_render_and_validate: Date.now() - pdfStarted
    };
    manifest.pdf_size_bytes = pdfBytes.length;
    pdfFile = root.createFile(pdfBlob);
  }

  manifest.status = 'completed';
  manifest.updated_at = new Date().toISOString();
  manifest.completed_at = new Date().toISOString();
  manifest.processed = invoices.length;
  manifest.total_outstanding = detailOutstanding;
  manifest.validation_difference = difference;
  manifest.filename = pdfFile.getName();
  manifest.download_url = pdfFile.getUrl();
  manifest.pdf_file_id = pdfFile.getId();
  manifest.final_duration_ms = Date.now() - started;

  var tempFolderId = manifest.temp_folder_id;
  var batchFileIds = manifest.batch_files.map(function(item) {
    return item.file_id;
  });

  // Manifest akhir menyimpan metadata minimum; isi nota hanya sementara.
  manifest.summary = null;
  manifest.batch_files = [];
  manifest.temp_folder_id = '';
  savePiutangPdfJobManifestV1_(manifestFile, manifest);

  batchFileIds.forEach(function(id) {
    try {
      DriveApp.getFileById(id).setTrashed(true);
    } catch (cleanupError) {
      Logger.log('PIUTANG PDF JOB: checkpoint sementara tidak terhapus otomatis.');
    }
  });
  if (tempFolderId) {
    try {
      DriveApp.getFolderById(tempFolderId).setTrashed(true);
    } catch (cleanupFolderError) {
      Logger.log('PIUTANG PDF JOB: folder sementara tidak terhapus otomatis.');
    }
  }

  Logger.log(
    'PIUTANG PDF JOB SELESAI | JOB=%s | NOTA=%s | SALDO=%s | HTML_MS=%s | PDF_BYTE=%s | TOTAL_MS=%s',
    manifestFile.getId(),
    invoices.length,
    detailOutstanding,
    htmlMs,
    manifest.pdf_size_bytes || 0,
    manifest.final_duration_ms
  );
  return piutangPdfJobPublicStateV1_(manifest, manifestFile.getId());
}

function loadPiutangPdfJobManifestV1_(jobId) {
  var id = String(jobId || '').trim();
  if (!/^[a-zA-Z0-9_-]{20,120}$/.test(id)) {
    throw new Error('ID pekerjaan PDF tidak valid.');
  }

  var root = getPiutangPdfJobRootFolderV1_();
  var file;
  try {
    file = DriveApp.getFileById(id);
  } catch (error) {
    throw new Error('Pekerjaan PDF tidak ditemukan atau aksesnya tidak tersedia.');
  }

  var parents = file.getParents();
  var belongsToRoot = false;
  while (parents.hasNext()) {
    if (parents.next().getId() === root.getId()) {
      belongsToRoot = true;
      break;
    }
  }
  if (!belongsToRoot) {
    throw new Error('Pekerjaan PDF tidak berada di folder layanan yang diizinkan.');
  }

  var manifest;
  try {
    manifest = JSON.parse(file.getBlob().getDataAsString());
  } catch (error) {
    throw new Error('Manifest pekerjaan PDF tidak dapat dibaca.');
  }
  if (!manifest || manifest.version !== 1 || manifest.type !== 'piutang_pdf_6d2_job') {
    throw new Error('Manifest pekerjaan PDF tidak valid.');
  }
  return { file: file, manifest: manifest };
}

function savePiutangPdfJobManifestV1_(file, manifest) {
  manifest.type = 'piutang_pdf_6d2_job';
  file.setContent(JSON.stringify(manifest));
}

function piutangPdfJobPublicStateV1_(manifest, jobId) {
  return {
    status: manifest.status,
    job_id: jobId,
    kode_pelanggan: manifest.kode_pelanggan,
    processed: Number(manifest.cursor || manifest.processed || 0),
    total: Number(manifest.total || manifest.processed || 0),
    total_outstanding: Number(
      manifest.total_outstanding ||
      (manifest.summary && manifest.summary.total_outstanding) ||
      0
    ),
    batch_size: PIUTANG_PDF_JOB_BATCH_SIZE,
    download_url: manifest.download_url || '',
    filename: manifest.filename || '',
    error: manifest.error || ''
  };
}

function piutangPdfJobDiscardTemporaryFilesV1_(manifest) {
  (manifest.batch_files || []).forEach(function(batchRef) {
    try {
      DriveApp.getFileById(batchRef.file_id).setTrashed(true);
    } catch (error) {
      Logger.log('PIUTANG PDF JOB: file checkpoint gagal dibersihkan.');
    }
  });
  if (manifest.temp_folder_id) {
    try {
      DriveApp.getFolderById(manifest.temp_folder_id).setTrashed(true);
    } catch (error) {
      Logger.log('PIUTANG PDF JOB: folder checkpoint gagal dibersihkan.');
    }
  }
  manifest.batch_files = [];
  manifest.temp_folder_id = '';
}

function getPiutangPdfJobRootFolderV1_() {
  var properties = PropertiesService.getScriptProperties();
  var folderId = properties.getProperty(PIUTANG_PDF_JOB_ROOT_PROPERTY);
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (error) {
      Logger.log('PIUTANG PDF JOB: folder layanan sebelumnya tidak dapat dibuka.');
    }
  }

  // Folder dibuat oleh akun yang menjalankan GAS dan tidak diberi sharing publik.
  var folder = DriveApp.createFolder('Laporan Detail Piutang - Privat');
  properties.setProperty(PIUTANG_PDF_JOB_ROOT_PROPERTY, folder.getId());
  return folder;
}
