# Supplier Hutang V1 — Umur Hutang (Aging) Contract

**Status:** APPROVED — Contract V1  
**Branch:** `ui/ux-polish-v3`  
**Scope:** Supplier Hutang V1  
**Source of truth:** SID Retail melalui backend GAS

---

## 1. Tujuan

Contract ini menetapkan definisi **Umur Hutang (Aging)** untuk modul Supplier Hutang V1.

Tujuannya adalah memberikan konteks umur setiap nota supplier yang masih outstanding tanpa mengubah definisi atau perhitungan saldo hutang yang sudah diaudit.

Contract ini sengaja menggunakan data yang benar-benar tersedia pada SID Retail. Tidak ada asumsi tentang termin pembayaran atau tanggal jatuh tempo supplier.

---

## 2. Source of Truth

Nilai outstanding tetap berasal dari:

`pembelian.hutang`

Scope nota yang masuk aging:

`pembelian.hutang_ke = 'supplier'`

dan

`pembelian.hutang > 0`

Dengan demikian aging hanya diterapkan pada nota supplier yang masih mempunyai saldo hutang.

### Data tanggal

Tanggal dasar aging berasal dari:

`pembelian.tanggal`

Audit V1 memverifikasi bahwa data tanggal yang diperoleh pada outstanding invoice menggunakan format:

`DD/MM/YYYY`

Contoh:

- `05/07/2021`
- `27/08/2023`
- `09/01/2026`
- `06/02/2026`

Audit dilakukan dengan query read-only terhadap 30 nota outstanding.

---

## 3. Definisi Umur Hutang

Umur hutang adalah jumlah hari antara tanggal nota dan tanggal acuan perhitungan.

`umur_hari = tanggal_acuan - tanggal_nota`

Tanggal nota berasal dari `pembelian.tanggal`.

Tanggal acuan adalah tanggal saat data aging dihitung oleh backend.

Untuk implementasi API, tanggal acuan harus berasal dari waktu backend dan dihitung dalam konteks tanggal kalender Indonesia yang digunakan sistem. Implementasi tidak boleh mengandalkan jam/browser user sebagai source of truth.

---

## 4. Aging Bucket V1

| Umur Hutang | Bucket | Makna |
|---:|---|---|
| 0–30 hari | Normal | Hutang relatif baru |
| 31–60 hari | Perlu Perhatian | Mulai perlu dipantau |
| 61–120 hari | Tinggi | Hutang sudah cukup lama |
| ≥121 hari | Urgent | Hutang sangat lama |

Boundary harus bersifat eksplisit:

- 30 hari = Normal
- 31 hari = Perlu Perhatian
- 60 hari = Perlu Perhatian
- 61 hari = Tinggi
- 120 hari = Tinggi
- 121 hari = Urgent

---

## 5. Aging Bukan Jatuh Tempo

V1 **tidak mendefinisikan tanggal jatuh tempo**.

Belum ada sumber data yang terverifikasi untuk:

- tanggal jatuh tempo,
- termin supplier,
- payment term,
- due date per supplier,
- atau aturan kredit supplier.

Karena itu istilah resmi yang digunakan adalah:

> **Umur Hutang / Aging**

Bukan "jatuh tempo".

Jika suatu saat sistem memiliki sumber data termin atau due date yang terverifikasi, fitur tersebut dapat dibuat sebagai contract terpisah.

---

## 6. Tidak Ada Rekonstruksi Saldo

Aging tidak boleh menghitung ulang saldo hutang.

Contoh yang benar:

`umur_hutang` dihitung dari `pembelian.tanggal`

sedangkan:

`sisa_hutang` tetap berasal dari `pembelian.hutang`

Aging hanya memberikan dimensi waktu terhadap saldo yang sudah ada.

Tidak diperbolehkan:

- mengganti `pembelian.hutang` dengan hasil rekonstruksi `itemhutang`,
- menggunakan `supplier.saldo_piutang` sebagai hutang supplier,
- membuat saldo baru dari tabel pembayaran,
- atau mengubah accounting logic Supplier Hutang V1.

---

## 7. API Direction

API Supplier Hutang V1 yang sudah ada tetap menjadi dasar.

List supplier tetap menggunakan:

`pembelian.hutang`

Detail supplier tetap menggunakan nota outstanding dari `pembelian`.

Jika aging diimplementasikan, field tambahan yang direncanakan adalah atribut hasil perhitungan backend, misalnya:

- `umur_hari`
- `aging_bucket`

Backend tetap menjadi tempat perhitungan.

Frontend hanya menampilkan hasil API dan tidak menghitung aging sendiri.

Perubahan API dilakukan setelah contract ini disetujui dan melalui HTTP test Development.

---

## 8. Business Safety

Contract ini tidak mengubah:

- saldo hutang,
- jumlah supplier,
- jumlah nota outstanding,
- accounting logic,
- Piutang,
- Collection Priority,
- Customer V1,
- Dashboard,
- atau source of truth SID Retail.

Aging adalah **informasi tambahan untuk membaca usia saldo**, bukan perubahan terhadap saldo.

---

## 9. Development Workflow

Implementasi harus mengikuti:

`CONTRACT → BACKEND → HTTP TEST → FRONTEND → UI/UX → QA → DOCUMENTATION → COMMIT`

Tahap berikutnya setelah contract ini:

1. Tambahkan field aging pada API Supplier Hutang V1.
2. Jalankan test backend.
3. Jalankan HTTP test Development.
4. Verifikasi beberapa nota dengan umur yang berbeda.
5. Integrasikan field ke frontend.
6. Tambahkan tampilan aging pada list/detail sesuai kebutuhan UI.
7. QA desktop/mobile.
8. Dokumentasikan hasil.
9. Commit dan review.

Tidak ada perubahan production dilakukan selama tahap Development.

---

## 10. Referensi Audit

Audit tanggal dilakukan melalui:

`auditSupplierHutangTanggalAgingV1()`

Audit bersifat read-only dan menggunakan satu targeted SELECT terhadap 30 outstanding invoice.

Hasil audit menunjukkan format tanggal konsisten pada sampel yang diperiksa dan mendukung penggunaan `pembelian.tanggal` sebagai dasar umur hutang.

---

## 11. Prinsip Akhir

> **Gunakan data yang benar-benar ada. Jangan menambahkan asumsi bisnis yang belum dibuktikan oleh database atau contract.**

Supplier Hutang V1 membaca saldo dari `pembelian.hutang`, mengambil tanggal nota dari `pembelian.tanggal`, lalu memberikan informasi umur hutang berdasarkan selisih hari.

Contract ini adalah dasar implementasi Aging Supplier Hutang V1.
