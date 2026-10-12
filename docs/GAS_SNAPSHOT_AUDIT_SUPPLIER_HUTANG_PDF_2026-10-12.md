# Audit Snapshot GAS — Supplier Hutang PDF
**Tanggal audit:** 12 Oktober 2026  
**Repository:** `klungdingbrag/siddev`  
**Branch:** `ui/ux-polish-v3`  
**Snapshot yang diperiksa:** `v13uiux-polish-v3.zip` dari pengguna  
**Jenis pemeriksaan:** static source review; tidak menjalankan query database atau mengubah deployment GAS.

## Kesimpulan
Snapshot memuat enam file GAS yang juga memiliki padanan di `code/` pada branch kerja: `Code.gs`, `Customer_API_V1.gs`, `Dashboard_Analytics_V1.gs`, `Production_Tabungan_V1.gs`, `Supplier_Hutang_API_V1.gs`, dan `Supplier_Hutang_Audit_V1.gs`.

Review ini tidak melakukan perubahan pada fungsi produksi maupun deployment. Penambahan PDF supplier belum dibuat dan belum diuji runtime. Snapshot file lokal tidak dengan sendirinya membuktikan bahwa deployment Web App Development sedang menjalankan versi source yang sama; hal itu tetap harus dikonfirmasi di Apps Script/Development.

## Pemeriksaan file dan jalur kode

### 1. `Code.gs`
- `apiV1Handle_` membungkus hasil dispatcher dalam envelope HTTP `{ success, api_version, action, data }` dan mengubah exception menjadi respons `success: false`.
- `apiV1Dispatch_` sudah mendaftarkan `supplierHutang` dan `supplierHutangDetail`.
- Dispatcher juga memiliki `pdfRingkasanPiutang` dan `pdfInvoice`, tetapi keduanya menggunakan kode/data piutang pelanggan. Keduanya tidak boleh dipakai sebagai endpoint PDF supplier.
- Fungsi `sidRetailQuery` melakukan request read terhadap SID Retail dan memeriksa HTTP/JSON response. Log diagnostik berisi SQL dan metadata request; jangan menambahkan log rahasia atau API key.

### 2. `Supplier_Hutang_API_V1.gs`
Kontrak data yang digunakan:
- Supplier: `pembelian.supplier`; nama dari `supplier.nama` melalui `supplier.kode`.
- Nomor nota: `pembelian.kode` (alias output `nota`).
- Tanggal: `pembelian.tanggal`.
- Nilai nota: `pembelian.jumlah`.
- Sisa hutang: `pembelian.hutang`.
- Scope: `pembelian.hutang_ke = 'supplier'` dan `pembelian.hutang > 0`.
- `itemhutang` hanya untuk jejak alokasi/diagnostik; saldo tidak direkonstruksi dari tabel tersebut.
- Return pembelian belum dimasukkan dalam kontrak V1; jangan mengubah perhitungan tanpa audit terpisah.

Temuan yang harus ditangani sebelum PDF:
1. `getSupplierHutangDetailV1` memakai `LIMIT 500`, tetapi tidak memberi indikator bahwa data mungkin terpotong. Ringkasan hasil fungsi dihitung dari baris yang dikembalikan, sehingga jumlah/total pada detail bisa tidak lengkap jika supplier memiliki lebih dari 500 nota outstanding.
2. `summary.total_nilai_nota` di fungsi detail adalah jumlah `pembelian.jumlah` untuk baris outstanding yang dikembalikan, bukan total historis semua nota supplier. Label PDF harus menjelaskan cakupan ini, atau kontrak data perlu diperluas dengan query aggregate terpisah yang terverifikasi.
3. Payload detail hanya menyertakan `kode_supplier`, bukan nama supplier. Generator PDF harus mendapatkan nama dari sumber yang terverifikasi; jangan mengandalkan nama dari browser tanpa validasi backend.
4. Detail hanya mengambil header nota dan saldo. Belum ada kontrak yang terbukti untuk item barang/kuantitas/harga/subtotal. PDF per nota tahap awal hanya boleh menyajikan header nota, total, dan saldo, kecuali audit sumber item menyatakan sebaliknya.
5. `getSupplierHutangV1` mengagregasi semua outstanding supplier, sementara detail dibatasi 500 nota. Ringkasan PDF tidak boleh menghitung ulang total global dari daftar detail yang mungkin terpotong.

Catatan dokumentasi source: komentar di bagian atas `Supplier_Hutang_API_V1.gs` mengatakan action belum didaftarkan pada dispatcher, tetapi `Code.gs` pada snapshot sudah memiliki dua case supplier. Komentar tersebut stale dan sebaiknya diperbarui saat file disentuh pada perubahan berikutnya, tanpa mengubah perilaku fungsi.

### 3. `Supplier_Hutang_Audit_V1.gs`
- Modul mendeklarasikan dirinya read-only.
- Fungsi audit memakai SELECT/discovery/aggregate untuk memeriksa struktur dan relasi; pada static scan tidak ditemukan statement mutasi SQL `INSERT INTO`, `UPDATE ... SET`, `DELETE FROM`, atau `REPLACE INTO`.
- Beberapa audit dapat memeriksa tabel atau mengagregasi data dalam jumlah besar. Jalankan secara selektif di Development dan ikuti catatan beban pada komentar fungsi; jangan menjalankan semua diagnostik sekaligus pada jam operasional.
- Hasil audit sebelumnya bukan pengganti tes HTTP terhadap deployment yang sedang berjalan.

### 4. File GAS lain
`Customer_API_V1.gs`, `Dashboard_Analytics_V1.gs`, dan `Production_Tabungan_V1.gs` berada di luar lingkup perubahan PDF supplier. Tidak ada alasan untuk mengubahnya pada implementasi ini.

## Risiko dan keputusan implementasi

| Area | Status | Keputusan |
|---|---|---|
| Source of truth saldo | Teridentifikasi di source | Gunakan `pembelian.hutang`; jangan hitung ulang dari `itemhutang` |
| Endpoint list/detail supplier | Ada di dispatcher source | Uji HTTP read-only di Development sebelum mengandalkan respons runtime |
| Endpoint PDF supplier | Belum ada | Jangan panggil endpoint PDF pelanggan sebagai pengganti |
| Data item pembelian | Belum terverifikasi | PDF nota awal berupa laporan header nota, kecuali audit lanjut membuktikan detail item |
| Pagination/limit 500 | Risiko kelengkapan | Tambahkan indikator truncation atau query khusus yang menjamin kelengkapan sebelum laporan dianggap final |
| Nama supplier | Tidak ada di payload detail | Resolve dari sumber backend terverifikasi |
| Logo | Diterima dari pengguna, belum dikonfirmasi tersimpan di repo | Simpan sebagai aset GitHub branch sebelum referensi generator PDF dibuat |
| Runtime Development | Belum diuji pada audit statis ini | Wajib tes HTTP dan browser setelah implementasi |

## Rencana kerja yang aman
1. Cocokkan snapshot dengan source project GAS Development yang benar-benar ter-deploy.
2. Jalankan tes read-only `supplierHutang` dan `supplierHutangDetail` melalui URL Development; catat envelope, jumlah baris, dan rekonsiliasi nilai.
3. Uji kasus supplier yang mempunyai lebih dari 500 nota outstanding atau tambahkan perlindungan eksplisit terhadap truncation.
4. Pastikan query nama supplier dan kontrak data nota/item yang diperlukan sebelum membuat generator.
5. Tambahkan endpoint PDF supplier khusus dan fungsi baru terisolasi; jangan mengubah generator/endpoint PDF pelanggan.
6. Simpan logo terpilih dan seluruh source/dokumentasi di branch `ui/ux-polish-v3`.
7. Uji header PDF, byte/header/EOF, nilai rupiah, karakter khusus, supplier/nota yang benar, download browser, dan error response.
8. Catat hasil tes nyata pada README dan handoff. Jangan menyebut fitur berhasil sebelum tes Development lulus.

## Batas audit ini
Ini adalah static source review dari ZIP dan source branch, bukan pengujian langsung ke SID Retail, bukan verifikasi deployment aktif, dan bukan validasi PDF. Tidak ada fungsi GAS yang diedit atau deployment yang diubah dalam audit ini.


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
