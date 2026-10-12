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


---

## Addendum — Source Audit 2026-10-10

Audit document: [`docs/SUPPLIER_HUTANG_PDF_SOURCE_AUDIT_2026-10-10.md`](SUPPLIER_HUTANG_PDF_SOURCE_AUDIT_2026-10-10.md)

### Hasil audit source code

- Kontrak source tetap: `pembelian.supplier`, `pembelian.kode`, `pembelian.tanggal`, `pembelian.jumlah`, dan saldo `pembelian.hutang`; scope `pembelian.hutang_ke = 'supplier'` dengan `pembelian.hutang > 0`.
- `getSupplierHutangDetailV1()` hanya mengambil header nota dan saldo; rincian item pembelian belum terbukti tersedia. PDF per nota versi awal harus berupa laporan header nota kecuali audit detail pembelian membuktikan sumber item.
- Dispatcher hanya memiliki PDF piutang/pelanggan; action PDF supplier belum ada. Jangan menganggap endpoint baru sudah aktif.
- `assets/img/` hanya memiliki `.gitkeep`; logo terpilih belum tersedia di repository untuk generator PDF.
- Audit ini memeriksa source code, bukan deployment runtime. HTTP test Development dan browser test masih pending.

### Status

**Source audit: selesai. Implementasi PDF supplier: belum dimulai.** Langkah berikutnya adalah mencocokkan snapshot GAS Development dengan source branch, menjalankan tes HTTP read-only untuk endpoint supplier yang sudah ada, dan memastikan aset logo tersedia. Jangan mengubah stable/production atau menyatakan fitur PDF lulus sebelum tes aktual selesai.


---

## Addendum — GAS Snapshot Audit 2026-10-12

Snapshot `v13uiux-polish-v3.zip` sudah diperiksa secara statis. Laporan lengkap berada di [`docs/GAS_SNAPSHOT_AUDIT_SUPPLIER_HUTANG_PDF_2026-10-12.md`](SUPPLIER_HUTANG_PDF_SOURCE_AUDIT_2026-10-10.md).

Ringkasan temuan:
- `Code.gs` sudah mendaftarkan action `supplierHutang` dan `supplierHutangDetail`.
- Belum ada action PDF supplier. Action `pdfRingkasanPiutang` dan `pdfInvoice` adalah jalur piutang pelanggan dan tidak boleh digunakan sebagai pengganti.
- Detail supplier saat ini dibatasi `LIMIT 500` tanpa indikator truncation. Summary detail dihitung dari baris yang diambil, sehingga perlu perlindungan sebelum digunakan untuk PDF yang dianggap lengkap.
- `summary.total_nilai_nota` pada detail hanya menjumlahkan nilai nota outstanding yang dikembalikan; jangan memberi label sebagai total historis semua nota.
- Payload detail belum memberikan nama supplier dan tidak membuktikan tersedianya rincian item pembelian.
- Static syntax check dengan Node.js lulus untuk keenam file GAS. Ini bukan pengujian runtime GAS atau HTTP Development.
- Static scan pada dua file supplier tidak menemukan statement SQL mutasi. Tidak ada fungsi atau deployment yang diubah dalam audit ini.
- Snapshot belum membuktikan versi yang aktif pada deployment Web App Development. HTTP read-only test dan rekonsiliasi data masih wajib.

Dokumentasi audit dibuat pada commit `35eb1123e8e2aceb48eb21ac7a04d2299400a77f`; README diperbarui pada commit `f2346f2cbc7963ea62a16b51bab0f8752e831e4d`.

**Status:** source review awal selesai; runtime Development belum diverifikasi; implementasi PDF supplier belum dimulai.


## Addendum — Development Read-only Data Test (2026-10-12)

User ran `testSupplierHutangV1()` and `testSupplierHutangDetailV1('JAYA')` directly in Apps Script. Both executions completed without an exception.

### Observed results

- List query: HTTP 200 from the SID Retail API; API status `success`.
- Supplier list includes rows such as JAYA, CAKRA, ROHMAT, REDO and others. The log was truncated by Apps Script, so the full supplier count and list-level grand total cannot be independently confirmed from this pasted log.
- JAYA detail query: HTTP 200 from the SID Retail API; API status `success`.
- JAYA returned 30 outstanding invoice rows.
- JAYA detail summary: total invoice value for the returned outstanding rows = Rp116.471.175,60; outstanding balance = Rp116.471.175,60.
- JAYA list aggregation: 30 outstanding invoices; total outstanding = Rp116.471.175,60.
- The 30-row detail and list aggregate agree for JAYA. This is a useful actual-data reconciliation for this supplier.
- The oldest displayed invoice has age 128 days and bucket `Urgent`, consistent with the documented `>=121` boundary.

### Scope and limitations

This confirms that the directly invoked GAS functions successfully query SID Retail and return actual data for these tests. It does **not** prove that the deployed Web App dispatcher/HTTP envelope has been tested end-to-end, that the frontend downloads a PDF, or that PDF generation works. The Apps Script message `Logging output too large. Truncating output` also means the complete supplier list result cannot be certified from the pasted output alone.

The 500-row limit remains in the detail query. JAYA has 30 outstanding notes, so this test does not exercise truncation. Before a PDF report is treated as complete for arbitrary suppliers, add a verified completeness strategy or an explicit truncation guard without changing the existing API behavior unexpectedly.

### Next step

Continue with isolated PDF supplier functions/actions on this branch only, preserving existing list/detail and customer PDF functions. Confirm logo asset handling and backend PDF transport before wiring the UI. Then run a separate Development Web App HTTP test and browser PDF QA. No production deployment or existing business function was changed by these tests.


---

## Addendum — Implementation Draft V1 (2026-10-12)

### Source changes committed on `ui/ux-polish-v3`

- Added `code/Supplier_Hutang_PDF_V1.gs` with isolated handlers:
  - `getPdfSupplierHutangSummaryV1(kodeSupplier)`
  - `getPdfSupplierHutangInvoiceV1(kodeSupplier, kodeNota)`
- Registered actions in `code/Code.gs`:
  - `pdfSupplierHutangSummaryV1`
  - `pdfSupplierHutangInvoiceV1`
- Added API clients and 60-second timeouts in `assets/js/api/endpoints.js` and `assets/js/api/client.js`.
- Added the Detail Supplier PDF summary button and per-outstanding-invoice PDF action in `assets/js/pages/supplier-hutang.js`.
- New generator uses `pembelian.hutang` and supplier-scoped invoice lookup. It does not change existing supplier list/detail functions or customer PDF generators.
- Summary query has a 5,000-row safety cap; if the cap is reached, generation is rejected rather than silently presenting a potentially truncated report.
- Invoice PDF is a generated SID Retail debt-position report, not a copy of the supplier's original invoice. Item detail is intentionally omitted because its source contract has not been verified.

### Validation completed so far

- Static JavaScript syntax checks passed for `Code.gs`, `Supplier_Hutang_PDF_V1.gs`, `assets/js/api/endpoints.js`, and `assets/js/pages/supplier-hutang.js` (module import/export declarations stripped for parser check).
- The earlier read-only data test remains valid: JAYA has 30 outstanding notes and list/detail totals reconcile at Rp116.471.175,60.
- No live Web App PDF action or browser download test has yet been run.
- PDF generation uses HtmlService HTML-to-PDF conversion; actual runtime support/rendering, byte validation, multi-page behavior, and browser transport remain unverified.

### Blocking requirement: logo asset

The new generator expects the selected logo at:
`assets/img/logo-cv-nusantara.png` on this branch and fails clearly if that asset is missing. The logo file has **not yet been committed** to the repository; therefore the generator is not ready for runtime acceptance until the actual user-provided blue/orange/gray PNG is added at that path. Do not substitute the pink stamp or an invented logo.

### Status

**Implementation draft committed; not yet deployable/accepted.** Do not deploy to Production. Next: commit the exact selected logo asset, test both new actions in the Development GAS deployment, inspect PDF header/startxref/%%EOF/size and rendered pages, then test the buttons/download in the Development browser. Record the actual results here before marking any acceptance criteria complete.


## Addendum — Development dispatcher action error (2026-10-12)

### Observed error

`Gagal membuat PDF supplier: API "pdfSupplierHutangSummaryV1" gagal: Action API V1 tidak dikenal: pdfSupplierHutangSummaryV1`

### Source verification

The current `ui/ux-polish-v3` GitHub source was fetched and inspected:
- `code/Code.gs` contains a dispatcher case for `pdfSupplierHutangSummaryV1`, routed to `getPdfSupplierHutangSummaryV1(apiV1Required_(request, 'kode_supplier'))`.
- The same dispatcher contains `pdfSupplierHutangInvoiceV1`.
- `assets/js/api/endpoints.js` sends `pdfSupplierHutangSummaryV1` with the `kode_supplier` parameter.
- `code/Supplier_Hutang_PDF_V1.gs` exists on this branch.

The active runtime error says the dispatcher does not recognize the action. Given that the current GitHub source does recognize it, the leading diagnosis is that the Development Web App is serving an older/different deployed GAS version or the frontend is pointing at a different GAS project/deployment. This is not yet proven until the deployed version and Web App URL are checked.

### Safe remediation

1. Open the **Development GAS project only**.
2. Confirm `Code.gs` matches `code/Code.gs` from this branch and that `Supplier_Hutang_PDF_V1.gs` has been added to the same GAS project.
3. Save the project and create/update a **new Development deployment version**. Saving source alone does not update a versioned Web App deployment.
4. Verify the frontend's configured GAS Web App URL points to that Development deployment.
5. Re-run the summary action. If the action is recognized but another error appears, capture the new error; that will indicate the next runtime blocker (for example, missing logo asset or PDF conversion).
6. Do not deploy to or modify Production/stable.

No source code or production function was changed in response to this runtime error. The current branch source already contains the action case, so the next step is to synchronize/verify the Development deployment rather than duplicate the dispatcher case.


### Logo asset path correction (2026-10-12)

The selected logo has now been committed in `assets/img/CV. NUSANTARA BUILDING MATERIAL LOGO.png` (alongside `assets/img/Stempel TB Nusantara.png`). The PDF generator previously requested the nonexistent `assets/img/logo-cv-nusantara.png`, which caused HTTP 404. Commit `3e1237fc5ac2a20b7807da91525ccc87af2d9fba` updates `SUPPLIER_HUTANG_PDF_V1.logoUrl` to the existing logo path, URL-encoded for spaces. This fixes the path mismatch in GitHub source; it does **not** prove the GAS Development deployment has received the update or that PDF generation passes. Re-sync this file to Development GAS, deploy a new Development version, then test both PDF actions. Do not touch Production/stable.


### Logo CacheService oversized value error (2026-10-12)

**Observed Development error:** `Exception: Argument too large: value` at `Supplier_Hutang_PDF_V1.gs:183`.

**Root cause:** `supplierHutangPdfGetLogoDataUriV1()` attempted to store the entire base64 logo data URI in `CacheService`. Apps Script cache values have a size limit; an image data URI can exceed it. The PDF failed before rendering, even though the logo URL was found.

**Fix committed:** `da66e019d0cdf739c5480d7ff88d788e9c3b89f5` on `ui/ux-polish-v3` removes caching of the data URI. The logo is fetched and converted to a data URI for each PDF request. This is a small asset fetch and avoids caching a potentially oversized value. No existing supplier/production function was changed.

**Validation status:** Source change is committed. Runtime success is not yet verified. Synchronize `code/Supplier_Hutang_PDF_V1.gs` to the Development GAS project, save and deploy a new Development version, then test both PDF actions. Confirm image fetch HTTP 200, PDF generation, valid PDF header/`startxref`/`%%EOF`, and correct logo rendering. Do not touch Production/stable.


### Layout update — totals and signatures below the note table (2026-10-12)

User reviewed generated files `Nota-JAYA-R21-080626004.pdf` and `Ringkasan-Hutang-JAYA.pdf` and requested the total to appear below the note rows, followed by signature fields.

Committed on `ui/ux-polish-v3`:
- `code/Supplier_Hutang_PDF_V1.gs` commit: `4e26c65fa8bb70ce479279075a786fef90a3979c`
- The KPI cards previously placed above the table are removed.
- A total row is added to the table footer, after the note rows, showing note count, total invoice value and total outstanding balance.
- Two blank signature areas are added below the table: `Supplier / Penerima` and `TB Nusantara`.
- This is a presentation-only change. It does not change SQL, accounting calculations, API actions, or production/stable branches.

**Runtime validation pending:** synchronize this file to GAS Development and regenerate both PDFs. Check that totals appear after the final note row, signature blocks follow the totals, and for multi-page summary the signature block remains together rather than splitting awkwardly across pages. Inspect the rendered PDF before marking this change accepted.


## 10. Audit lanjutan: rincian item pembelian untuk PDF per nota (2026-10-12)

### Temuan dari source code GitHub

- `getPdfSupplierHutangInvoiceV1()` pada `code/Supplier_Hutang_PDF_V1.gs` hanya mengambil `p.kode`, `p.tanggal`, `p.jumlah`, dan `p.hutang` dari tabel `pembelian`. Generator saat ini tidak mengambil detail barang.
- `getSupplierHutangDetailV1()` pada `code/Supplier_Hutang_API_V1.gs` juga hanya mengembalikan header nota, total, sisa hutang, dan aging; tidak mengembalikan item barang.
- `code/Code.gs` memiliki pola nota pelanggan `getNotaTransaksi()` yang membaca `itempenjualan` berdasarkan `kode`, dengan kolom `nourut,kode,kode_barang,nama_barang,satuan,qty,harga,diskon,diskon_rupiah,subtotal`. Pola ini hanya membuktikan struktur item penjualan, **bukan** struktur item pembelian; jangan menyalinnya begitu saja untuk supplier.
- `code/Supplier_Hutang_Audit_V1.gs` memasukkan `itempembelian` sebagai nama tabel kandidat untuk audit, tetapi itu belum membuktikan tabel tersebut ada atau memiliki kolom/relasi yang diasumsikan.
- Audit file dan source GitHub tidak bisa memastikan data aktual tabel pada database Development. Karena itu, nama tabel dan kolom item pembelian tetap BELUM TERVERIFIKASI.

### Diagnostic baru

File `code/Supplier_Purchase_Items_Audit_V1.gs` ditambahkan pada branch `ui/ux-polish-v3` (commit `3f0a9f1aea9fda2c01eb8dbca92aa301ad6f84f2`).

Fungsi publik untuk dropdown GAS:
`auditSupplierPurchaseItemsV1(kodeSupplier, kodeNota)`

Default sampel:
- Supplier: `BARU`
- Nota: `R21-071026001`

Fungsi ini READ-ONLY dan hanya menjalankan SELECT:
1. Memeriksa header nota pada `pembelian` memakai kontrak yang sudah terverifikasi.
2. Menguji hipotesis tabel kandidat `itempembelian` dengan `SELECT * ... LIMIT 20`, lalu mencatat nama kolom dan contoh baris.
3. Menangkap error bila tabel/kolom tidak ada; tidak membuat asumsi dan tidak menulis data.

### Langkah Development berikutnya

1. Salin file diagnostic baru dari GitHub ke GAS Development.
2. Jalankan `auditSupplierPurchaseItemsV1` tanpa parameter untuk sampel default atau masukkan kode supplier/nota lain.
3. Kirim output Execution log, terutama kedua blok probe dan nama kolom item.
4. Setelah hasil nyata ditinjau, verifikasi relasi item-header, subtotal, diskon, satuan, dan rekonsiliasi total nota.
5. Baru setelah source contract lolos, implementasikan item pada PDF per nota. Jangan menambahkan query item ke generator PDF sebelum audit aktual berhasil.

**Tidak ada perubahan pada fungsi produksi, query hutang, dispatcher, frontend, atau generator PDF dalam audit ini.** Belum ada endpoint baru dan belum ada klaim bahwa item purchase table sudah terverifikasi. Stable/production tidak disentuh.


### Diagnostic syntax fix (2026-10-12)

Fixed invalid JavaScript regular expressions in `code/Supplier_Purchase_Items_Audit_V1.gs`. The hyphen is now placed at the end of the character class (`/^[a-zA-Z0-9._ -]+$/`) so valid supplier codes and invoice numbers containing hyphens can pass validation. Commit: `0e7c6c7605c5a9c28f05ee8dc0644e1cfe4d6946`.

This is a syntax/input-validation fix only. It does not change database queries, business logic, dispatcher/API actions, PDF generation, or production/stable. Re-sync this file to GAS Development and run `auditSupplierPurchaseItemsV1()` again. Runtime audit remains pending until the execution log is reviewed.


### Follow-up fix: remove regex entirely (2026-10-12)

The user continued seeing the original `Invalid regular expression ... /[a-zA-Z0-9._\\- ]+/` error in GAS, which indicates their editor was still executing stale code or the prior copy did not replace the old lines. To eliminate this failure mode rather than relying on regex replacement, input validation in `code/Supplier_Purchase_Items_Audit_V1.gs` now uses a simple allowlist loop and contains no regular expressions. Commit: `38e1ef69d5a611136420ee5b4c1a51b333649c35`.

For GAS Development, replace the entire contents of the existing diagnostic file with the latest file from this commit; editing only part of the validation block may leave the stale regex behind. This remains a diagnostic-only change and does not affect production or stable.

### Multi-item purchase audit added (2026-10-12)

Commit: [993712d3ba95f460f18b77d0353770000af68390](https://github.com/klungdingbrag/siddev/commit/993712d3ba95f460f18b77d0353770000af68390)

The read-only diagnostic file now also exposes the public GAS function:

`auditSupplierPurchaseMultiItemV1(kodeSupplier, kodeNota)`

- Without parameters, it searches for multi-item purchase notes for supplier `BARU` using a grouped/joined SELECT.
- If it finds candidates, it selects the first candidate and logs the invoice header, item rows (up to 100), item subtotal sum, header total, and difference.
- To inspect a known multi-item invoice directly, pass both arguments, e.g. `auditSupplierPurchaseMultiItemV1("BARU", "KODE_NOTA")`.
- The diagnostic is READ-ONLY. It does not alter PDF generation, API dispatch, supplier balances, or production/stable.
- The query uses an aggregation/join to discover candidates; if the backend rejects that SQL form, the function logs the error and can be rerun with a known invoice code.
- The subtotal comparison is only a diagnostic signal. Discounts, fees, rounding, or row limits may explain a mismatch; do not change PDF calculations until the actual rows and accounting semantics are reviewed.

**User action required:** replace the entire `Supplier_Purchase_Items_Audit_V1.gs` file in GAS Development with the current GitHub file, save, and run `auditSupplierPurchaseMultiItemV1`. Send the complete Execution log, especially candidate query status, item count, item rows, and reconciliation. If it finds no candidates, provide a known invoice with multiple item lines and run the function with the supplier and invoice codes. No runtime test has been claimed yet.

### Multi-item audit result and PDF detail draft (2026-10-12)

**Runtime evidence provided by the user:** `auditSupplierPurchaseMultiItemV1()` completed successfully in GAS Development and found multi-item candidates for supplier `BARU`. The selected invoice was `R21-020722001`, dated `02/07/2022`, with 2 item rows:
- PVC RUCIKA 4 D — 20 LJR × Rp167.000 = Rp3.340.000
- GLASS BLOCK DIAMOND — 30 PCS × Rp21.500 = Rp645.000
- Sum of item subtotals: Rp3.985.000
- Header `pembelian.jumlah`: Rp3.985.000
- Difference: Rp0

This confirms the `itempembelian` table, the tested `kode` relation, and these fields for this sample: `nourut`, `kode_barang`, `nama_barang`, `satuan`, `qty`, `harga_beli`, `harga_setelah_diskon`, `diskon`, `subtotal`. It does not prove all invoices have the same semantics or that discounts/fees never affect reconciliation. The sample note is already paid (`pembelian.hutang = .00`), so it validates item sourcing but not the outstanding-note PDF path.

**PDF source draft committed:** [`code/Supplier_Hutang_PDF_V1.gs`](../code/Supplier_Hutang_PDF_V1.gs), commit [`4bae10ee244259d2fc80af2985642e18ef74269d`](https://github.com/klungdingbrag/siddev/commit/4bae10ee244259d2fc80af2985642e18ef74269d). The invoice PDF handler now queries `itempembelian` for the selected outstanding supplier note and adds an item table with item number, item name/code, quantity, unit, unit price, discount field, and subtotal; totals for invoice value and remaining debt are retained. It aborts if item rows are missing or reach the 500-row guard. The summary PDF path and supplier balance calculations are not changed.

**Not yet accepted:** the updated PDF source has not yet been synced to GAS Development or run in the Web App/browser. The first sample was paid and cannot be used to test the new outstanding-note PDF. Next, select a multi-item invoice with `pembelian.hutang > 0`, run `auditSupplierPurchaseItemsV1("SUPPLIER_CODE", "INVOICE_CODE")` to confirm item details and then test the invoice PDF action in Development. Inspect the rendered rows, prices/discounts, invoice total, remaining balance, logo, PDF validity, and browser download before treating this as complete.

**Audit refinement:** commit [70ab9f3f9cccaac11ab75e1d573f609e3b045735](https://github.com/klungdingbrag/siddev/commit/70ab9f3f9cccaac11ab75e1d573f609e3b045735) updates the candidate search to require `COALESCE(p.hutang,0) > 0`. The default run now seeks a multi-item invoice that is still outstanding, which is the appropriate case for testing the PDF action. This source change still requires syncing the complete diagnostic file into GAS Development and running it.

