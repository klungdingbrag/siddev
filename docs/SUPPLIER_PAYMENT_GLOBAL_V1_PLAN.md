# Supplier Payment Global V1 — Audit & Implementation Plan

Status: **Audit first; no payment-write code implemented yet**  
Branch: `feature/supplier-payment-global-v1`  
Baseline: `chore/gas-cleanup-v1`  
Date: 2026-10-14

## 1. Tujuan

Menyempurnakan pembayaran hutang supplier pada SID Retail agar pengguna dapat memilih supplier, memasukkan satu nominal pembayaran global, lalu sistem mengalokasikan nominal tersebut ke nota outstanding dari tanggal tertua ke terbaru. Setelah transaksi berhasil tersimpan, pengguna dapat menyiapkan pesan konfirmasi untuk dibagikan melalui WhatsApp.

## 2. Aturan bisnis yang disetujui

1. Pembayaran global hanya untuk satu supplier per transaksi.
2. Alokasi otomatis memakai urutan `tanggal nota ASC`, lalu `kode nota ASC` sebagai tie-breaker.
3. Pembayaran parsial diperbolehkan: sisa nominal dialokasikan ke nota berikutnya setelah nota sebelumnya lunas.
4. Nominal harus positif.
5. **Pembayaran yang melebihi total hutang tercatat harus ditolak.** Tidak boleh otomatis menjadi uang muka/saldo supplier.
6. Simulasi alokasi harus ditampilkan sebelum penyimpanan.
7. Tombol Share WhatsApp baru tersedia setelah backend mengonfirmasi transaksi tersimpan. Pesan dibentuk dari data transaksi yang tersimpan, bukan dari simulasi.
8. Request yang dikirim ulang tidak boleh membuat pembayaran ganda (idempotency/deduplication perlu dirancang sesuai kemampuan backend).

## 3. Temuan source saat audit awal

### API Hutang Supplier V1

File: `code/Supplier_Hutang_API_V1.gs`

- API saat ini bersifat **read-only**.
- Daftar dan detail nota membaca sisa hutang dari `pembelian.hutang`.
- Scope nota: `pembelian.hutang_ke = 'supplier'` dan `pembelian.hutang > 0`.
- Detail nota diurutkan `p.tanggal ASC, p.kode ASC`, dengan limit 500.
- `itemhutang` digunakan sebagai jejak alokasi untuk audit; API V1 tidak menghitung ulang saldo dari tabel tersebut.
- Return pembelian belum masuk perhitungan saldo pada kontrak V1.

### Dispatcher

File: `code/Code.gs`, fungsi `apiV1Dispatch_`

- Action `supplierHutang` dan `supplierHutangDetail` tersedia untuk membaca data.
- Action PDF ringkasan dan PDF nota supplier juga tersedia.
- Pada dispatcher yang diperiksa, belum ditemukan action API V1 untuk menyimpan pembayaran supplier.

### Arsip audit lama

File arsip: `docs/gas-diagnostics-archive/Supplier_Hutang_Audit_V1.gs.md`

- Audit sebelumnya memeriksa relasi `hutang`, `itemhutang`, dan `pembelian`.
- Arsip menyebut kandidat tabel pembayaran lain seperti `pembayaranpembelian` dan `pembayaran_pembelian`, tetapi keberadaan nama tabel dalam daftar kandidat **bukan bukti** bahwa tabel tersebut aktif atau merupakan jalur tulis yang benar.
- Rumus diagnostik berbasis `SUM(itemhutang.jumlah)` tidak boleh dianggap sebagai source of truth tanpa verifikasi tambahan.
- Karena itu, belum aman untuk menulis ke tabel mana pun atau mengubah `pembelian.hutang` secara langsung.

## 4. Gerbang audit sebelum implementasi write

Semua butir berikut harus diverifikasi dari source dan data Development yang benar:

1. Identifikasi alur pembayaran supplier yang sudah dipakai aplikasi saat ini (UI -> API -> backend/server).
2. Temukan endpoint dan kode penyimpanan transaksi yang aktif, bila ada.
3. Verifikasi struktur tabel/kolom yang benar-benar dipakai untuk header pembayaran, alokasi nota, sumber dana/kas, dan referensi.
4. Verifikasi bagaimana transaksi lama memperbarui `pembelian.hutang`, `pembelian.lunas`, `pembelian.kekurangan_sdh_dibayar`, dan/atau tabel ledger.
5. Gunakan transaksi/atomic operation yang didukung server, atau dokumentasikan keterbatasan dan strategi konsistensi yang tersedia. Jangan mengklaim atomicity tanpa bukti.
6. Tentukan idempotency key berdasarkan kontrak backend yang nyata.
7. Uji satu pembayaran parsial yang terkontrol di Development, lalu rekonsiliasi saldo dan ledger sebelum dan sesudahnya. Jangan lakukan pengujian tulis pada produksi.
8. Verifikasi apakah nomor transaksi dapat dibuat dengan mekanisme existing dan bagaimana menghindari duplikasi.

## 5. Kontrak UI yang direncanakan

- Pilih supplier.
- Tampilkan total hutang tercatat dan daftar nota outstanding.
- Input tanggal pembayaran, nominal, dan field sumber dana/metode/referensi hanya jika didukung oleh alur existing.
- Tampilkan pratinjau alokasi FIFO (nota tertua dahulu).
- Validasi nominal: finite, positif, dan tidak lebih besar dari total hutang supplier saat backend memvalidasi ulang.
- Simpan pembayaran.
- Setelah sukses, tampilkan nomor pembayaran, nominal, rincian alokasi, dan sisa hutang.
- Sediakan Share WhatsApp yang membuka pesan terformat; pengguna tetap menekan tombol kirim sendiri.
- Jika simpan gagal atau status tidak pasti, jangan menawarkan share sebagai pembayaran berhasil; sediakan cara memeriksa status transaksi agar retry tidak menggandakan pembayaran.

## 6. Matriks uji minimum

- Nominal kosong, nol, negatif, dan bukan angka -> ditolak.
- Nominal tepat sama dengan total hutang -> semua nota outstanding terlunasi.
- Nominal lebih kecil dari nota tertua -> pembayaran parsial pada nota tertua.
- Nominal menutup satu nota dan sebagian nota berikutnya -> alokasi sesuai urutan.
- Nominal sama dengan total hutang -> diterima; lebih besar satu rupiah -> ditolak.
- Dua nota bertanggal sama -> urutan konsisten berdasarkan kode nota.
- Supplier tanpa hutang -> tidak bisa membayar.
- Data hutang berubah antara pratinjau dan simpan -> backend menghitung ulang dan menolak/menyesuaikan secara aman sesuai kontrak yang ditetapkan.
- Request simpan terkirim dua kali / respons timeout -> tidak terjadi pembayaran ganda.
- Kegagalan di tengah penyimpanan -> tidak meninggalkan saldo dan ledger yang berbeda tanpa mekanisme pemulihan yang teruji.
- Pesan WhatsApp memuat data tersimpan dan rincian alokasi yang tepat.

## 7. Batasan perubahan

- Branch ini dibuat dari `chore/gas-cleanup-v1`.
- Tidak ada perubahan pada branch stable/produksi.
- Belum ada kode yang menulis pembayaran atau mengubah data bisnis.
- Belum ada deployment ke Google Apps Script.
- Nama fungsi publik GAS baru tidak boleh berakhiran underscore.
- Setelah audit lulus, implementasi harus memakai jalur pembayaran existing jika memang terverifikasi, dan semua perubahan kode/kontrak endpoint harus didokumentasikan.

## 8. Status saat ini

**Audit awal selesai; audit jalur tulis masih terbuka.** Implementasi pembayaran tidak boleh dimulai sebelum jalur tulis existing dan struktur data yang aktif terverifikasi. Langkah berikutnya adalah melacak frontend pembayaran supplier dan API/backend transaksi yang saat ini dipakai, kemudian melakukan uji tulis terkontrol hanya di Development.
