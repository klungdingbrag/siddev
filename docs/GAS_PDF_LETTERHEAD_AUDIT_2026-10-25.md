# Audit Kop PDF GAS — 2026-10-25

**Branch:** `ui/ux-polish-v3`  
**Code source:** `code/Code.gs`  
**Commit perubahan:** `5e630b728fe97865f67bae85a0fed931c8fa78d8`

## Perbandingan sumber

ZIP GAS yang diunggah berisi enam file. Setelah diekstrak, isi keenam file dibandingkan dengan `code/*.gs` pada branch ini; teksnya identik. Perubahan dibatasi pada kop PDF dalam `code/Code.gs`.

## Empat PDF yang diminta

| PDF | Generator / jalur |
| --- | --- |
| Laporan PDF dari detail pelanggan | `getPdfCustomerStatementV1` |
| Ringkasan PDF dari detail Piutang | `getPdfRingkasanPiutangPelanggan` → `buildRingkasanPiutangPdfHtml_` |
| Laporan Detail PDF 6D.2 | `getPdfSemuaDetailPiutang_6D2` → `stage6d2BuildReportHtml_` |
| PDF Invoice untuk satu nota dari detail Piutang | `buildInvoicePdfHtml_`, dipanggil melalui `getPdfInvoiceTransaksi` |

Keempat jalur tersebut akhirnya merender melalui `buildPiutangPdfCompanyHeaderHtml_` dan logo yang dimuat melalui `getPiutangPdfLogoDataUri_`. Perubahan satu helper kop ini menyamakan header keempat keluaran tersebut.

## Perubahan

- Sumber logo disamakan dengan logo Invoice: `assets/img/cvnbm-stempel-hd.png` pada branch `ui/ux-polish-v3`.
- Judul kop menjadi satu baris: `CV NUSANTARA BUILDING MATERIAL | TB NUSANTARA`.
- Baris alamat disamakan dengan Invoice, termasuk pemenggalan setelah `RT 001/RW 001,`.
- Baris telepon, WhatsApp, email, dan website disusun seperti Invoice.
- Garis kop memakai warna biru perusahaan `#0b3f88`, dengan ketebalan 3px.
- Typo alamat situs `tbnusatara.com` diperbaiki menjadi `tbnusantara.com`.

Perubahan hanya menyentuh URL logo pada loader dan HTML kop bersama. Query, kontrak API, pemetaan transaksi, perhitungan saldo, serta isi/tabel laporan tidak diubah. Invoice browser dan Surat Jalan juga tidak diubah pada commit ini.

## Pemeriksaan

- Statis: keempat jalur generator di atas memakai helper kop bersama.
- URL logo pada branch berhasil dibuka sebagai PNG berukuran 1827×1827.
- Belum dilakukan deployment atau pembuatan PDF dari Apps Script. Hasil final perlu dikonfirmasi setelah `code/Code.gs` disalin ke proyek GAS dan deployment yang digunakan diperbarui.
