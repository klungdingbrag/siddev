# Supplier Hutang API V1 — Integration

Tanggal: 2026-10-09

## Integrasi

Supplier Hutang V1 sekarang tersedia melalui API V1 dispatcher.

Action baru:
- supplierHutang
- supplierHutangDetail

Dispatcher hanya menjadi adapter HTTP. Business logic tetap berada di `code/Supplier_Hutang_API_V1.gs`.

## Perubahan yang diizinkan

Perubahan pada `code/Code.gs` hanya menambahkan dua `case` pada `apiV1Dispatch_()`.

Tidak ada fungsi existing yang diubah, diganti, atau dihapus.

## Kontrak

`supplierHutang` memanggil `getSupplierHutangV1()`.

`supplierHutangDetail` membutuhkan parameter `kode_supplier` dan memanggil `getSupplierHutangDetailV1()`.

Source of truth tetap:
- `pembelian.supplier`
- `supplier.nama`
- `pembelian.jumlah`
- `pembelian.hutang`
- `pembelian.hutang_ke = 'supplier'`

## Safety

Piutang, Customer, Dashboard, Tabungan, PDF, dan fungsi production lain tidak disentuh oleh integrasi ini.

## Tahap berikutnya

HTTP test melalui deployment Web App Development harus dilakukan sebelum frontend Hutang dibuat.