# Perubahan Layout Informasi PDF Detail Piutang — 2026-10-26

**Branch:** `ui/ux-polish-v3`  
**Source:** `code/Code.gs`  
**Commit source:** `bc2d4b57b62d4d80c1a7be8d75b2e4e81e8c3d74`

## Permintaan

- Judul `LAPORAN DETAIL PIUTANG PELANGGAN` rata tengah.
- Blok kiri menampilkan `TANGGAL CETAK` dan `PERIODE NOTA`, masing-masing dengan pemisah titik dua sejajar.
- Blok kanan menampilkan `Pelanggan`, `Kode`, dan `Alamat`, juga dengan titik dua sejajar.
- Nilai alamat panjang dapat membungkus di dalam blok kanan.

## Implementasi

Perubahan dibatasi pada CSS dan metadata table di `stage6d2BuildReportHtml_`, generator PDF 6D.2. Format tanggal, periode, nilai pelanggan, kode, alamat, tabel nota, ringkasan, serta logika saldo tetap memakai sumber dan formatter yang sama. Tidak ada perubahan query, API, atau fungsi PDF lain.

## Pemeriksaan

- Source di GitHub diperiksa setelah perubahan untuk memastikan judul rata tengah dan metadata terbagi dua blok.
- Belum menjalankan GAS atau membuat PDF pasca-perubahan. Hasil cetak perlu dikonfirmasi setelah `code/Code.gs` diperbarui di Apps Script dan deployment digunakan.

## Addendum: susunan ringkasan, saldo, dan rekening

**Commit source:** `da7514496cd1211d6be1b2686b605ec7d06e42fc`  
**Follow-up page-break commit:** `275bb780e5d5be03ea151cece9b7ce0971332cd5`

Bagian akhir laporan kini dirancang sebagai berikut:

1. Total saldo hutang tampil sebagai baris tegas di atas kolom ringkasan dan TTD.
2. Kolom kiri memuat Ringkasan dengan Total Invoice, Total Dibayar, dan Total Saldo Hutang.
3. Kolom kiri dilanjutkan informasi transfer BRI.
4. Kolom kanan memuat TTD dan nama Wasimun.
5. Total saldo hutang ditampilkan kembali di dalam Ringkasan agar angka utama dan rinciannya sama-sama tampak.

Perubahan hanya pada markup/CSS bagian penutup `stage6d2BuildReportHtml_`. Nilai menggunakan variabel yang sama seperti sebelumnya; query dan perhitungan tidak diubah. Seluruh kelompok penutup (baris total, ringkasan, rekening, dan TTD) diberi aturan agar tetap bersama saat pindah halaman.

Perlu menyalin `code/Code.gs` terbaru ke Apps Script dan memperbarui deployment sebelum hasil ini muncul di PDF live. PDF pasca-deployment belum diperiksa.
