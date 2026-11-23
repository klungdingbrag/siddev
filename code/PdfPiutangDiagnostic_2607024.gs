/**
 * DIAGNOSTIK PDF DETAIL PIUTANG -> GOOGLE DRIVE (READ ONLY)
 *
 * Target dikunci ke pelanggan 2607024 agar tes tidak dapat dipakai
 * untuk kode pelanggan lain secara tidak sengaja.
 *
 * Fungsi ini TIDAK menambah route API dan TIDAK mengubah generator PDF
 * produksi. Jalankan manual dari editor Apps Script:
 *   runDiagnosticPdfPiutang2607024ToPrivateDrive
 *
 * Yang diukur:
 * 1. Ringkasan nota outstanding (termasuk lookup kontak yang digunakan jalur 6D.2).
 * 2. Pengambilan header + item setiap nota.
 * 3. Penyusunan HTML laporan.
 * 4. Konversi HTML menjadi satu PDF utuh dan validasi PDF.
 * 5. Penyimpanan PDF ke folder Drive privat.
 *
 * Hasil PDF tidak dibagi per bagian dan tidak dikirim sebagai Base64.
 * Data SID hanya dibaca. File dibuat di Drive milik akun GAS dan akses
 * sharing tidak diubah; folder/file mengikuti izin privat bawaan Drive.
 */

function runDiagnosticPdfPiutang2607024ToPrivateDrive() {
  var customerCode = '2607024';
  var startedAt = Date.now();
  var timings = {};
  var started;

  Logger.log('===== DIAGNOSTIK PDF PIUTANG 2607024: MULAI =====');
  Logger.log('MODE: READ ONLY SID | OUTPUT: SATU PDF UTUH DI DRIVE PRIVAT');

  // Tahap 1: ringkasan nota, saldo referensi, identitas/kontak.
  started = Date.now();
  var ringkasan = getRingkasanPiutangPelanggan(customerCode);
  timings.summary_ms = Date.now() - started;

  if (!ringkasan || ringkasan.status !== 'success') {
    throw new Error('Ringkasan piutang tidak berhasil dibaca.');
  }
  if (!Array.isArray(ringkasan.data)) {
    throw new Error('Data nota ringkasan tidak berbentuk daftar.');
  }

  Logger.log(
    'TAHAP RINGKASAN: %s ms | NOTA=%s | TOTAL OUTSTANDING=%s',
    timings.summary_ms,
    ringkasan.data.length,
    ringkasan.total_outstanding
  );

  // Tahap 2: ambil header + item satu per satu memakai fungsi yang sama
  // dengan jalur 6D.2. Log hanya nomor nota, durasi, dan jumlah item.
  var detailStarted = Date.now();
  var invoices = [];

  ringkasan.data.forEach(function(row, index) {
    var noteCode = validateStage6TransactionCode_(row.kode_transaksi);
    var noteStarted = Date.now();
    var note = getNotaTransaksiUntukPiutangPdf(noteCode);
    var noteDuration = Date.now() - noteStarted;

    if (!note || note.status !== 'success') {
      throw new Error('Detail nota ke-' + (index + 1) + ' gagal dibaca.');
    }
    if (!note.summary || Number(note.summary.piutang) <= 0) {
      throw new Error('Nota ke-' + (index + 1) + ' tidak lagi outstanding.');
    }

    invoices.push(note);
    Logger.log(
      'TAHAP DETAIL NOTA %s/%s: %s ms | ITEM=%s',
      index + 1,
      ringkasan.data.length,
      noteDuration,
      Array.isArray(note.items) ? note.items.length : 0
    );
  });

  timings.details_ms = Date.now() - detailStarted;

  var detailOutstanding = invoices.reduce(function(total, note) {
    return total + Number(note.summary.piutang || 0);
  }, 0);
  var difference = detailOutstanding - Number(ringkasan.total_outstanding || 0);

  if (Math.abs(difference) > 0.01) {
    throw new Error(
      'Rekonsiliasi gagal: ringkasan=' + ringkasan.total_outstanding +
      ', detail=' + detailOutstanding + ', selisih=' + difference
    );
  }

  Logger.log(
    'TAHAP DETAIL SELESAI: %s ms | REKONSILIASI SELISIH=%s',
    timings.details_ms,
    difference
  );

  // Bentuk objek dan gunakan renderer 6D.2 yang sama dengan PDF produksi.
  var reportData = {
    status: 'success',
    generated_at: ringkasan.generated_at,
    kode_pelanggan: customerCode,
    nama_pelanggan: ringkasan.nama_pelanggan,
    telp: ringkasan.telp,
    alamat: ringkasan.alamat,
    count: invoices.length,
    total_outstanding: detailOutstanding,
    ringkasan: ringkasan.data,
    invoices: invoices,
    duration_ms: timings.summary_ms + timings.details_ms
  };

  started = Date.now();
  var report = stage6d2BuildReportHtml_(reportData);
  timings.html_ms = Date.now() - started;
  Logger.log(
    'TAHAP HTML: %s ms | PANJANG HTML=%s | JUMLAH NOTA=%s',
    timings.html_ms,
    report.html.length,
    report.invoice_count
  );

  // Satu dokumen lengkap; tidak ada pemecahan PDF atau subtotal per bagian.
  started = Date.now();
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
  timings.pdf_render_validate_ms = Date.now() - started;

  Logger.log(
    'TAHAP RENDER PDF + VALIDASI: %s ms | UKURAN=%s byte',
    timings.pdf_render_validate_ms,
    pdfBytes.length
  );

  // Simpan ke folder privat milik pemilik project GAS.
  started = Date.now();
  var folder = getOrCreatePrivatePdfPiutangDiagnosticFolder_();
  var file = folder.createFile(pdfBlob);
  timings.drive_save_ms = Date.now() - started;

  var totalMs = Date.now() - startedAt;
  var result = {
    status: 'success',
    read_only_sid: true,
    kode_pelanggan: customerCode,
    invoice_count: invoices.length,
    total_outstanding: detailOutstanding,
    reconciliation_difference: difference,
    pdf_size_bytes: pdfBytes.length,
    timings_ms: timings,
    total_duration_ms: totalMs,
    drive_file_name: file.getName(),
    drive_file_url: file.getUrl(),
    drive_folder_url: folder.getUrl(),
    drive_visibility: 'Mengikuti izin privat akun pemilik Apps Script; tidak ada sharing publik.'
  };

  Logger.log('TAHAP SIMPAN DRIVE: %s ms', timings.drive_save_ms);
  Logger.log('TOTAL DURASI: %s ms (%s detik)', totalMs, (totalMs / 1000).toFixed(2));
  Logger.log('PDF DRIVE: %s', file.getUrl());
  Logger.log('FOLDER DRIVE: %s', folder.getUrl());
  Logger.log('HASIL DIAGNOSTIK: %s', JSON.stringify(result));
  Logger.log('===== DIAGNOSTIK PDF PIUTANG 2607024: SELESAI =====');

  return result;
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
