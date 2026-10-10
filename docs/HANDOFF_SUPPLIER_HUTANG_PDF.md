# Handoff — Supplier Hutang PDF (SID Retail)

**Dokumen ini dibuat:** 10 Oktober 2026  
**Repository:** `klungdingbrag/siddev`  
**Branch kerja:** `ui/ux-polish-v3`  
**Baseline branch sebelum dokumen handoff:** `a8e30600cfe118599ba126125cd48b97332991b4`  
**Status fitur PDF Hutang Supplier:** PERENCANAAN / BELUM DIIMPLEMENTASIKAN / BELUM DITEST

Dokumen ini adalah catatan kesinambungan untuk melanjutkan pekerjaan dari chat baru. Baca dokumen ini sebelum mengubah kode.

---

## 1. Aturan kerja yang harus dipertahankan

- Kerjakan fitur pada branch `ui/ux-polish-v3`, bukan branch stable/production.
- Jangan mengubah production atau stable untuk eksperimen.
- SID Retail/backend adalah sumber kebenaran transaksi dan saldo.
- Jangan mengarang endpoint atau menganggap fungsi backend sudah tersedia sebelum memeriksa dispatcher dan source GAS.
- Jangan menyatakan berhasil sebelum diuji di browser terhadap Development backend.
- Catat perubahan pada README dan/atau dokumen handoff ini.
- Untuk fungsi Google Apps Script, jangan menambahkan trailing underscore (`_`) pada nama fungsi yang perlu tampil di dropdown GAS.

## 2. Konteks pekerjaan terakhir yang sudah dilakukan

Perbaikan scroll modal Hutang Supplier agar polanya mengikuti Detail Piutang sudah dicatat di branch ini:

- CSS commit: [3c115f77e344b0654a76915f6dba7ba650656738](https://github.com/klungdingbrag/siddev/commit/3c115f77e344b0654a76915f6dba7ba650656738)
- Dokumentasi commit: [a8e30600cfe118599ba126125cd48b97332991b4](https://github.com/klungdingbrag/siddev/commit/a8e30600cfe118599ba126125cd48b97332991b4)

Perubahan scroll tersebut sudah ditulis di README. Pengujian visual browser masih harus dikonfirmasi oleh pengguna; jangan mengklaim lulus tanpa hasil tes.

## 3. Keputusan desain PDF yang telah disetujui

Pengguna memilih hanya dua jenis PDF pada Detail Supplier:

1. **Ringkasan Hutang Supplier** — ringkasan supplier yang sedang dibuka, dengan ringkasan finansial dan daftar nota outstanding.
2. **PDF per Nota** — satu PDF untuk satu nota yang dipilih.

**Jangan menambahkan “Laporan Detail PDF” gabungan** untuk semua nota supplier.

### Susunan kop perusahaan

Pengguna mengunggah dua logo. Logo biru/oranye/abu-abu dipilih sebagai logo utama untuk dokumen PDF formal. Logo kedua merah muda tidak dipilih sebagai logo utama PDF saat ini.

Teks kop yang diminta:

- **TB NUSANTARA**
- **CV NUSANTARA BUILDING MATERIAL**
- **JL. LINTAS SELATAN RT.001 RW.001 DK. GAJAH, SUROREJAN PURING KEBUMEN**
- **081234563843**

Usulan tata letak: logo utama di sebelah kiri, nama usaha di kanan, alamat dan telepon di bawah nama, lalu garis pemisah sebelum judul laporan. Gunakan kop yang sama untuk Ringkasan Hutang Supplier dan PDF per Nota.

**Catatan aset:** logo saat ini terlihat pada percakapan, tetapi belum diverifikasi tersimpan sebagai file dalam repository atau backend GAS. Sebelum implementasi, pastikan file logo dapat diakses oleh generator PDF Development. Jangan membuat referensi ke nama file logo yang belum benar-benar ada.

## 4. Rancangan isi PDF

### A. Ringkasan Hutang Supplier

Urutan yang disarankan:

1. Kop perusahaan dan logo.
2. Judul **LAPORAN HUTANG SUPPLIER**.
3. Nama supplier.
4. Tanggal/waktu cetak.
5. Ringkasan finansial: **Total Nilai Nota**, **Sisa Hutang**, dan jumlah nota outstanding.
6. Tabel nota outstanding dengan kolom yang tersedia dan tervalidasi, minimal nomor nota, tanggal nota, umur hutang, total nota, sisa hutang.
7. Footer singkat bahwa laporan dihasilkan oleh SID Retail (opsional).

Definisi total nilai nota harus mengikuti kontrak data yang jelas. Jika hanya mencakup nota outstanding, jangan mencampur nota lunas ke dalam total tanpa penjelasan. Saldo hutang wajib mengikuti field backend yang telah diaudit, bukan dihitung ulang secara spekulatif.

### B. PDF per Nota

Urutan yang disarankan:

1. Kop perusahaan dan logo yang sama.
2. Judul **DETAIL NOTA HUTANG SUPPLIER**.
3. Identitas supplier.
4. Nomor dan tanggal nota.
5. Total nota dan sisa hutang.
6. Rincian item/pembayaran hanya jika data sumber memang tersedia dan maknanya telah diverifikasi.

PDF per nota dari SID Retail adalah laporan yang dihasilkan aplikasi, bukan otomatis salinan faktur asli dari supplier.

## 5. Temuan audit backend yang sudah diketahui

Berdasarkan dokumen audit backend `docs/GAS_BACKEND_AUDIT_2026-10-09.md` dan source GAS yang diperiksa:

- Saldo hutang supplier bersumber dari `pembelian.hutang`.
- Filter transaksi supplier: `pembelian.hutang_ke = 'supplier'`.
- Nota outstanding: `pembelian.hutang > 0`.
- `itemhutang` dapat membantu penelusuran alokasi/pembayaran, tetapi jangan merekonstruksi saldo berjalan dari tabel ini jika field `pembelian.hutang` sudah menjadi saldo terpelihara.
- Jangan menggunakan `supplier.saldo_piutang` sebagai sumber hutang supplier tanpa bukti terpisah.
- API dispatcher `apiV1Dispatch_` sudah memiliki action `supplierHutang` dan `supplierHutangDetail`.
- Dispatcher yang diperiksa juga memiliki `pdfRingkasanPiutang` dan `pdfInvoice`, tetapi keduanya adalah jalur PDF piutang/pelanggan. **Jangan menggunakannya langsung untuk data supplier** tanpa audit sumber transaksi dan kontraknya.
- Belum ditemukan/ditetapkan kontrak backend PDF supplier. Jangan menganggap endpoint PDF supplier sudah ada.

## 6. Kondisi frontend yang diperiksa

File yang relevan:

- `assets/js/pages/supplier-hutang.js`
- `assets/js/pages/piutang.js`
- `assets/js/api/endpoints.js`
- `assets/css/app.css`
- `README.md`

Detail Supplier saat ini menampilkan ringkasan dan tabel nota outstanding. Belum ada tombol PDF ringkasan supplier maupun PDF per nota yang diimplementasikan di frontend. Endpoint di `assets/js/api/endpoints.js` saat ini mencakup `supplierHutang` dan `supplierHutangDetail`, tetapi belum ada endpoint PDF supplier yang telah diverifikasi.

Pola Piutang yang dapat dipelajari:
- Tombol Ringkasan PDF memanggil endpoint ringkasan khusus pelanggan.
- Tombol PDF per invoice memanggil endpoint invoice khusus pelanggan.
- Ada pola loading, penanganan payload PDF, validasi, download Blob, dan notifikasi error/sukses.
- Gunakan kembali pola UI/transport yang cocok, tetapi buat kontrak data dan backend supplier yang terpisah dan benar.

## 7. Rencana implementasi berikutnya

Kerjakan berurutan; jangan melompati audit backend:

1. Periksa source GAS Development terkini dan seluruh jalur data nota pembelian supplier: nomor nota, tanggal, total nilai, saldo outstanding, serta rincian item jika tersedia.
2. Pastikan cara dispatcher Development menerima action dan struktur respons yang benar.
3. Tetapkan kontrak backend khusus supplier untuk:
   - ringkasan PDF satu supplier;
   - PDF satu nota supplier.
4. Pastikan aset logo dapat digunakan generator PDF di Development. Jangan memasukkan gambar base64 besar ke frontend tanpa alasan; pilih cara penyimpanan yang sesuai dengan arsitektur backend.
5. Implementasikan generator PDF dengan kop yang sama, encoding teks aman, format rupiah/tanggal Indonesia, dan penanganan banyak halaman bila dibutuhkan.
6. Tambahkan endpoint ke frontend `assets/js/api/endpoints.js`.
7. Tambahkan tombol **Ringkasan PDF** di area detail supplier dan aksi **PDF** pada setiap baris nota.
8. Reuse pola loading/error/validasi payload/download dari Piutang tanpa menggunakan data atau endpoint piutang untuk hutang supplier.
9. Dokumentasikan perubahan dalam README dan dokumen ini.
10. Uji di Development: supplier dengan banyak nota, nilai rupiah, nama/alamat yang mengandung karakter khusus, nota outstanding, respons kosong/error, validitas PDF (header, ukuran, EOF), download dan tampilan hasil cetak. Jangan menyatakan selesai sebelum tes dilakukan.

## 8. Kriteria selesai

- [ ] Logo biru utama tampil benar di kop PDF.
- [ ] Kop memuat nama usaha, nama CV, alamat, dan telepon sesuai data yang diberikan.
- [ ] Ringkasan PDF hanya memuat supplier yang dipilih dan angka sesuai backend.
- [ ] PDF per nota menampilkan nota yang dipilih, tidak tertukar dengan nota lain.
- [ ] Tidak ada laporan detail gabungan.
- [ ] Data hutang tidak memakai endpoint atau rumus piutang pelanggan.
- [ ] PDF berhasil dibuka dan diunduh melalui browser Development.
- [ ] Error backend/payload ditangani dengan pesan yang jelas.
- [ ] README dan dokumen handoff diperbarui dengan commit yang dapat dilacak.

## 9. Prompt untuk memulai chat baru

Salin prompt berikut ke chat baru:

> Lanjutkan proyek SID Retail dari repository `klungdingbrag/siddev`, branch `ui/ux-polish-v3`. Baca dahulu `docs/HANDOFF_SUPPLIER_HUTANG_PDF.md` dan bagian README yang dirujuk di dalamnya. Jangan mengubah stable/production. Fitur yang direncanakan adalah PDF Ringkasan Hutang Supplier dan PDF per Nota, dengan kop TB NUSANTARA memakai logo biru yang sudah dipilih. Fitur PDF supplier belum diimplementasikan dan belum diuji. Audit source GAS Development serta kontrak data nota supplier lebih dahulu, pastikan aset logo tersedia untuk generator PDF, lalu implementasikan secara bertahap, dokumentasikan, dan jangan menyatakan lulus sebelum diuji di browser Development. Jangan membuat endpoint atau asumsi data tanpa verifikasi.
