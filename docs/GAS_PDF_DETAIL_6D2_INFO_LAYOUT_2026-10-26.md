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
