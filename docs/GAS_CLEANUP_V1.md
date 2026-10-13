# GAS Cleanup V1 — SID Retail

Tanggal: 2026-10-13  
Branch: `chore/gas-cleanup-v1`  
Status: perubahan source di branch pengembangan; **belum dideploy ke Google Apps Script dan belum dinyatakan lulus runtime test**.

## Tujuan

Mengurangi kode diagnosis/pengujian dari source GAS operasional sambil menjaga fungsi produksi, nama endpoint, perhitungan, dan kontrak API tetap sama.

## Perubahan yang dilakukan

1. `code/Code.gs`
   - Mengeluarkan fungsi diagnosis mandiri `diagnosticCustomerDetailV3`.
   - Fungsi disimpan dalam arsip dokumentasi.
   - Tidak mengubah `doGet`, `doPost`, dispatcher API, endpoint produksi, atau fungsi bisnis piutang/PDF.

2. `code/Supplier_Hutang_API_V1.gs`
   - Mengeluarkan enam fungsi test yang bukan endpoint produksi:
     - `testSupplierHutangV1`
     - `testSupplierHutangDetailV1`
     - `testSupplierHutangPartialPaymentV1`
     - `testSupplierHutangAgingV1`
     - `testSupplierHutangAgingDataV1`
     - `testSupplierHutangAgingHttpV1`
   - Fungsi produksi `getSupplierHutangV1`, `getSupplierHutangDetailV1`, fungsi pemetaan aging, dan helper terkait tetap dipertahankan tanpa perubahan logika yang disengaja.

3. Dua file audit dikeluarkan dari folder source GAS operasional:
   - `code/Supplier_Hutang_Audit_V1.gs`
   - `code/Supplier_Purchase_Items_Audit_V1.gs`
   - Isi lengkapnya dipertahankan dalam folder arsip dokumentasi di bawah `docs/gas-diagnostics-archive/`. Tidak ada isi audit yang sengaja dihilangkan.

## Arsip

- `docs/gas-diagnostics-archive/Supplier_Hutang_Audit_V1.gs.md`
- `docs/gas-diagnostics-archive/Supplier_Purchase_Items_Audit_V1.gs.md`
- `docs/gas-diagnostics-archive/Fungsi_Diagnosis_dan_Test.md`

Arsip Markdown adalah referensi saja dan bukan file source `.gs` yang dimuat ke project GAS.

## Batasan dan perlindungan

- Perubahan hanya berada di branch `chore/gas-cleanup-v1`.
- Branch produksi/stable tidak diubah.
- Tidak ada deployment GAS yang dilakukan.
- Tidak ada perubahan yang disengaja pada SQL, perhitungan saldo, data database, API production action names, maupun frontend.
- Kode yang diarsipkan dapat dipulihkan bila kelak diperlukan untuk diagnosis.

## Pemeriksaan yang masih wajib dilakukan

Sebelum branch ini dipakai untuk memperbarui project GAS Development:

1. Bandingkan endpoint dispatcher dengan action yang dipanggil frontend.
2. Jalankan pemeriksaan sintaks dan pemeriksaan referensi fungsi pada semua source `.gs`.
3. Uji endpoint dashboard, pelanggan, tabungan, piutang, dan hutang supplier di GAS Development.
4. Uji pembuatan PDF supplier serta endpoint PDF piutang yang masih digunakan.
5. Periksa log GAS dan pastikan tidak ada `ReferenceError` atau action tidak dikenal.
6. Cocokkan hasil data/angka dengan versi sebelumnya.

**Catatan:** pemindahan kode dari folder source mengubah fungsi yang tersedia di editor GAS setelah sinkronisasi/deployment, jadi hasil runtime tetap harus diverifikasi di project Development sebelum perubahan dipertimbangkan untuk produksi.
