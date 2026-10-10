# Audit Sumber Data PDF Hutang Supplier — 2026-10-10

**Repository:** `klungdingbrag/siddev`  
**Branch:** `ui/ux-polish-v3`  
**Scope:** audit kode repository sebelum implementasi PDF supplier  
**Status:** CODE AUDIT COMPLETE; DEVELOPMENT HTTP / BROWSER VALIDATION PENDING  
**Production/stable:** tidak diubah

## 1. Ringkasan keputusan

Fitur yang direncanakan tetap hanya dua:

1. Ringkasan Hutang Supplier untuk supplier yang sedang dibuka.
2. PDF satu nota dari daftar nota outstanding pada Detail Supplier.

Tidak dibuat PDF gabungan semua nota. PDF per nota adalah dokumen laporan yang dihasilkan SID Retail, bukan salinan faktur asli supplier.

## 2. Sumber data yang terverifikasi di source code

File yang diperiksa:

- `code/Supplier_Hutang_API_V1.gs`
- `code/Code.gs` (dispatcher API V1)
- `assets/js/pages/supplier-hutang.js`
- `assets/js/api/endpoints.js`
- `assets/js/api/client.js`
- `assets/js/pages/piutang.js`
- `docs/GAS_BACKEND_AUDIT_2026-10-09.md`
- `docs/SUPPLIER_HUTANG_AGING_V1_CONTRACT.md`

Kontrak data yang digunakan oleh API supplier saat ini:

| Field laporan | Sumber | Catatan |
|---|---|---|
| Kode supplier | `pembelian.supplier` | Kunci supplier dari transaksi |
| Nama supplier | `supplier.nama` via `supplier.kode` | Nama fallback menggunakan kode |
| Nomor nota | `pembelian.kode` | Dipetakan menjadi `nota` |
| Tanggal nota | `pembelian.tanggal` | Format yang diamati: DD/MM/YYYY |
| Nilai nota | `pembelian.jumlah` | Dipetakan menjadi `total_nota` |
| Sisa hutang | `pembelian.hutang` | Saldo outstanding yang dipelihara SID Retail |
| Scope transaksi | `pembelian.hutang_ke = 'supplier'` | Memastikan transaksi hutang supplier |
| Filter outstanding | `pembelian.hutang > 0` | Nota lunas tidak masuk daftar saat ini |

API detail menghitung ringkasan `total_nilai_nota`, `total_hutang`, dan `jumlah_nota_bersaldo` dari baris nota outstanding yang dikembalikan. Karena itu label PDF perlu eksplisit, misalnya **Total Nilai Nota Outstanding**, agar tidak disalahartikan sebagai seluruh nota supplier termasuk yang sudah lunas.

### Batas data yang belum terverifikasi

`getSupplierHutangDetailV1()` hanya mengambil header/summary nota: nomor, tanggal, nilai nota, saldo hutang, serta beberapa field status. Source yang diperiksa belum membuktikan adanya kontrak item barang untuk pembelian supplier (nama barang, kuantitas, harga satuan, diskon, dan subtotal). Maka:

- Jangan menampilkan rincian item pada PDF per nota sebelum tabel/relasi detail pembelian dan field-nya diaudit.
- Versi pertama PDF per nota harus berupa **ringkasan header nota** dengan data yang benar-benar tersedia.
- Jangan menyebut dokumen ini sebagai faktur asli supplier.

Audit ini adalah audit source code; belum merupakan bukti bahwa deployment Development saat ini menjalankan byte source yang sama.

## 3. Dispatcher dan endpoint

Dispatcher di `code/Code.gs` sudah memiliki action:

- `supplierHutang` → `getSupplierHutangV1()`
- `supplierHutangDetail` → `getSupplierHutangDetailV1(kode_supplier)`
- `pdfRingkasanPiutang` dan `pdfInvoice` → generator PDF khusus pelanggan/piutang

Belum ada action PDF supplier pada dispatcher yang diperiksa, dan `assets/js/api/endpoints.js` belum memiliki method PDF supplier. Nama endpoint baru belum dianggap ada atau aktif.

Sebelum mengimplementasikan, kontrak yang diusulkan untuk direview adalah:

- satu action ringkasan dengan parameter `kode_supplier`;
- satu action nota dengan parameter `kode_supplier` dan `kode_nota` (atau parameter invoice yang disepakati secara eksplisit).

Nama final harus diselaraskan dengan pola request/response di dispatcher dan diuji melalui Web App Development. Backend harus membaca ulang data terpilih dari SID Retail dan memvalidasi bahwa nota memang milik supplier tersebut; jangan percaya total/saldo yang dikirim frontend.

## 4. Generator dan transport PDF yang ada

Generator PDF piutang menggunakan pola HTML → `HtmlService.createHtmlOutput(...).getBlob().getAs(MimeType.PDF)`, lalu mengirimkan `pdf_base64`, `mime_type`, `size_bytes`, dan metadata melalui API. `assets/js/api/client.js` mengembalikan `data` dari envelope dan memiliki timeout khusus untuk PDF.

Pola transport, validasi byte, download Blob, loading, dan error dari Piutang boleh digunakan sebagai referensi. Business logic dan sumber data piutang tidak boleh dipakai untuk hutang supplier.

## 5. Status aset logo

Direktori `assets/img/` pada branch ini hanya berisi `.gitkeep`; file logo utama biru/oranye/abu-abu belum tersimpan di direktori tersebut. File/logo yang dapat diakses generator PDF Development juga belum terverifikasi.

Sebelum PDF formal dirilis, tambahkan aset logo terpilih ke repository atau tentukan penyimpanan backend yang sesuai. Jangan membuat referensi ke nama file yang belum ada, dan jangan mengganti dengan logo merah muda yang tidak dipilih. Kop yang disetujui:

- **TB NUSANTARA**
- **CV NUSANTARA BUILDING MATERIAL**
- **JL. LINTAS SELATAN RT.001 RW.001 DK. GAJAH, SUROREJAN PURING KEBUMEN**
- **081234563843**

## 6. Langkah kerja berikutnya

1. Pastikan snapshot source GAS di project **Development** cocok dengan source repository, terutama `Code.gs`, `Supplier_Hutang_API_V1.gs`, dan dispatcher.
2. Jalankan tes read-only pada Web App Development untuk `supplierHutang` dan `supplierHutangDetail`; catat HTTP status, envelope, kode supplier/nota yang diuji, dan rekonsiliasi summary terhadap baris detail.
3. Temukan/konfirmasi aset logo terpilih yang dapat digunakan generator PDF Development.
4. Tetapkan kontrak dua action PDF supplier, validasi ownership nota, dan skema response.
5. Implementasikan generator backend khusus supplier, lalu sambungkan endpoint frontend.
6. Tambahkan tombol Ringkasan PDF dan aksi PDF per nota di Detail Supplier.
7. Uji byte PDF (`%PDF-`, ukuran aktual vs metadata, `startxref`, `%%EOF`), download browser, nilai rupiah, karakter khusus, multi-halaman, respons kosong/error, supplier/nota yang salah, dan tampilan hasil cetak.
8. Perbarui README dan dokumen handoff dengan hasil test nyata serta commit SHA.

## 7. Status pengujian pada saat audit ini ditulis

| Pemeriksaan | Status |
|---|---|
| Baca handoff dan README pada branch | PASS |
| Audit source kontrak data supplier | PASS (source code) |
| Audit action dispatcher yang sudah ada | PASS (source code) |
| Verifikasi field rincian item pembelian | BELUM TERBUKTI |
| Aset logo tersedia di `assets/img/` | FAIL — hanya `.gitkeep` |
| HTTP test terhadap deployment Development saat ini | PENDING |
| Browser test / PDF byte validation untuk fitur baru | BELUM DILAKUKAN |
| Fitur PDF supplier | BELUM DIIMPLEMENTASIKAN |

Jangan menyatakan fitur PDF supplier selesai sebelum tes Development dan browser menghasilkan bukti yang dicatat di dokumen ini.
