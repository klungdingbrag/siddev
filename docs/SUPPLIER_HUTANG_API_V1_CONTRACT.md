# Supplier Hutang API V1 — Contract

Tanggal: 2026-10-09

## Tujuan

Menambahkan lapisan read-only untuk Hutang Supplier tanpa mengubah fungsi file .gs produksi yang sudah terbukti berjalan.

File baru:
- code/Supplier_Hutang_API_V1.gs

Integrasi ke Code.gs belum dilakukan pada tahap ini.

## Source of Truth V1

Berdasarkan audit backend dan record nyata:
- kode supplier: pembelian.supplier
- nama supplier: supplier.nama melalui supplier.kode
- nilai invoice: pembelian.jumlah
- sisa hutang berjalan: pembelian.hutang
- scope outstanding: pembelian.hutang_ke = 'supplier' AND pembelian.hutang > 0

itemhutang terbukti berguna sebagai jejak/alokasi pembayaran, tetapi tidak digunakan untuk menghitung ulang saldo berjalan V1.

supplier.saldo_piutang tidak digunakan sebagai saldo hutang supplier.

Return pembelian belum dimasukkan ke rumus V1. Jika nanti diperlukan, harus dibuat audit/kontrak terpisah terlebih dahulu.

## Fungsi

### getSupplierHutangV1()
Daftar supplier yang memiliki hutang berjalan:
- kode_supplier
- nama_supplier
- jumlah_nota_bersaldo
- total_hutang

Urutan: total_hutang DESC, kemudian kode supplier.

### getSupplierHutangDetailV1(kodeSupplier)
Daftar nota outstanding supplier:
- nota
- tanggal
- total_nota
- sisa_hutang
- status
- flag legacy lunas
- flag kekurangan_sdh_dibayar

Batas detail V1: 500 nota.

## Test terisolasi

Jalankan langsung di Apps Script:
1. testSupplierHutangV1()
2. testSupplierHutangDetailV1() — default supplier JAYA
3. testSupplierHutangPartialPaymentV1() — kontrak partial payment AHE

Tidak satu pun test tersebut membutuhkan perubahan dispatcher Web App.

## Safety

Tahap ini tidak:
- mengubah Code.gs
- mengubah fungsi Piutang
- mengubah Customer
- mengubah Dashboard
- mengubah Tabungan
- mengubah PDF
- menambah action publik pada apiV1Dispatch_()
- menulis data SID Retail

Urutan integrasi berikutnya hanya dilakukan setelah hasil test GAS konsisten.