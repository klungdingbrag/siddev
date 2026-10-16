# Pemetaan Fungsi Dashboard dan Piutang

**Branch:** `ui/ux-polish-v3`  
**Tanggal pemetaan:** 15 Oktober 2026  
**Tujuan:** Menentukan batas modul yang aman untuk perawatan bertahap.  
**Ruang lingkup:** Peta awal audit UI dan catatan ekstraksi renderer grafik Dashboard.

## Snapshot sumber

| File | Baris | Blob SHA saat dipetakan |
|---|---:|---|
| `assets/js/pages/dashboard.js` | 948 | `2961d3ce19b5ed3a13c1f260d211be2bd480b37d` |
| `assets/js/pages/piutang.js` | 1100 | `0e0f79c763e21b223da09f47e532eb60dd318bde` |

Rentang baris di bawah merujuk ke snapshot awal sebelum ekstraksi; setelah source berubah, gunakan peta status implementasi sebagai acuan terbaru.

## 1. Dashboard

### Peta tanggung jawab

| Baris | Fungsi | Tanggung jawab |
|---|---|---|
| 1–18 | Import, konstanta, `dashboardState` | Mengimpor endpoint API dan menyimpan periode, data, loading, dan error. |
| 20–61 | Rentang tanggal dan formatter | Membentuk rentang bulan/tahun serta memformat nilai rupiah. |
| 62–107 | Cache Dashboard | Membaca, menulis, dan memulihkan snapshot melalui `sessionStorage`. |
| 108–179 | Normalisasi dan format data | Escape HTML, label bulan, normalisasi omzet/laba, dan mengambil total piutang dari envelope API. |
| 180–303 | `buildDashboardShell()` | Membuat markup halaman, KPI, panel grafik, kalender, serta kontrol periode. |
| 304–391 | `renderDashboardCalendar()` | Menyusun kalender aktivitas dari data transaksi. |
| 392–596 | `renderLineChart()`, `renderProfitChart()` | Merender grafik omzet dan laba beserta tooltip/interaksi pointer. |
| 597–734 | Normalisasi dan grafik laba harian | Menormalkan data laba harian lalu membuat grafik dan interaksi tooltip/crosshair. |
| 735–792 | Kontrol dan helper UI | Mengisi kontrol periode, indikator loading, pemeriksaan mount, dan pengisian teks elemen. |
| 793–862 | `renderDashboardData()` | Mengubah state Dashboard menjadi KPI dan visual yang tampil. |
| 863–931 | `loadDashboard()` | Mengatur pemuatan/cache dan request data dari API. |
| 932–948 | `renderDashboardPage()` | Entry point yang dipanggil router; membangun halaman, mengikat kontrol, dan memulai pemuatan. |

### Alur data

`renderDashboardPage()` → shell dan event kontrol → `loadDashboard()` → endpoint `dashboardSalesDaily`, `dashboardProfitMonthly`, `dashboardProfitDaily`, dan `piutang` → normalisasi dan state → `renderDashboardData()` → KPI, grafik, dan kalender.

### Batas pemisahan yang disarankan

- Pertahankan `renderDashboardPage()` sebagai entry point yang diekspor dan `loadDashboard()` sebagai pengatur state/API.
- Renderer grafik telah dipindahkan ke `assets/js/pages/dashboard/charts.js`; formatter, escape, dan helper teks tetap dimiliki controller dan diberikan sebagai dependency.
- Kalender merupakan kandidat terpisah setelah dependensi format bulan dan bentuk data baris ditentukan.
- Pertahankan key dan format cache, urutan request, penanganan error, ID/class DOM, serta nama endpoint.
- Normalisasi data dan aturan rekonsiliasi tetap berada di batas data Dashboard; jangan menggabungkannya dengan renderer visual.

## 2. Piutang

### Peta tanggung jawab

| Baris | Fungsi/kelompok | Tanggung jawab |
|---|---|---|
| 1–57 | Import, state, formatter | Endpoint API, paging/search/filter state, format rupiah/angka, dan escape HTML. |
| 58–89 | `renderPiutangPage()` | Entry point; membuat heading, ringkasan, prioritas, toolbar, tabel/kartu, modal, lalu memasang event. |
| 90–162 | `bindEvents()` | Mengikat refresh, pencarian, filter, sort, pagination, detail, PDF, WhatsApp, dan modal. |
| 163–317 | Pemuatan dan cache | `loadPiutang()`, refresh backend, apply/read/write cache, dan status refresh. |
| 318–418 | Normalisasi dan ringkasan | Membaca envelope respons, memperbarui total, menghitung prioritas collection dan ringkasannya. |
| 419–513 | Filter, sort, paging, list rendering | `filterAndRender()`, aging bucket, `renderTable()`, markup baris desktop dan kartu. |
| 514–689 | Detail pelanggan | Membuka detail, mengambil/memetakan tabungan dan transaksi, menampilkan detail serta aging/nota. |
| 690–925 | Pembuatan dan unduhan PDF | Aksi PDF, 6D.2, ekstraksi payload, konversi/validasi byte PDF, loading, dan download. |
| 926–1080 | WhatsApp dan action modal | Memilih kontak, menyusun pesan/laporan, membuka WhatsApp, dan menutup/menangani modal. |
| 1081–1100 | Status UI | State loading/error/empty dan toast. |

### Alur utama

- **Daftar:** render halaman → event → load/cache → normalisasi → ringkasan/prioritas → filter/sort → tabel atau kartu.
- **Detail:** klik pelanggan → `openDetail()` → endpoint detail/tabungan → normalisasi → `renderDetail()`.
- **PDF:** aksi detail → endpoint PDF → validasi byte → unduh.
- **WhatsApp:** aksi → pemilih kontak → susun pesan → buka WhatsApp.

### Batas pemisahan yang disarankan

- Pertahankan `renderPiutangPage()` sebagai entry point router.
- List rendering adalah kandidat ekstraksi paling aman setelah state yang dibutuhkan dibuat eksplisit. `rowHtml()` dan `cardHtml()` bergantung pada metadata prioritas, formatter, dan escape; dependensi itu harus dinyatakan jelas.
- Pemfilteran/sortir masih memakai `state`; pada tahap awal tetap di controller atau terima state sebagai argumen. Jangan membuat state global kedua.
- Detail, PDF, dan WhatsApp membentuk alur pengguna yang saling terhubung. Pertahankan di file saat ini sampai batas API/markup masing-masing dipetakan lebih lanjut; jangan pindahkan sekaligus dengan renderer daftar.
- Jangan mengubah ID, class, `data-*` attributes, urutan event, format uang, fallback envelope API, dan urutan panggilan endpoint.

## 3. Urutan refactor yang aman

1. Ekstraksi renderer grafik dan kalender Dashboard telah selesai sebagai perubahan terpisah.
2. Langkah berikutnya adalah memetakan ulang batas fungsi Dashboard dan Piutang pada source terbaru, lalu mengusulkan ekstraksi renderer daftar Piutang yang tetap menerima state/dependency secara eksplisit.
3. Setelah daftar stabil, audit alur detail, PDF, dan WhatsApp secara terpisah sebelum memilih batas modul untuk bagian tersebut.
4. Setiap ekstraksi dibuat sebagai perubahan terisolasi di GitHub dan ditinjau sebelum ekstraksi berikutnya.

## 4. Status implementasi: ekstraksi grafik Dashboard

- Ditambahkan `assets/js/pages/dashboard/charts.js` untuk grafik omzet harian, laba bulanan, dan laba harian.
- `dashboard.js` tetap menjadi pemilik state, cache, normalisasi data, API, kalender, kontrol periode, dan entry point router. Modul grafik mempertahankan tooltip serta tampilan rekonsiliasi laba harian seperti sebelumnya.
- Renderer menerima formatter/escape dan helper teks melalui parameter; tidak dibuat salinan helper.
- Nama endpoint, struktur cache, ID/class DOM, isi tooltip, dan urutan pemanggilan renderer dipertahankan.
- Pemeriksaan yang dilakukan: kedua modul lolos parse sintaks JavaScript. Suite runtime/test tidak dijalankan.

## 5. Status implementasi: ekstraksi kalender Dashboard

- Ditambahkan `assets/js/pages/dashboard/calendar.js` untuk renderer kalender.
- `dashboard.js` mengirim periode terpilih dan helper format sebagai parameter; tidak ada state global kedua.
- Struktur markup, ID/class, event klik, label tanggal, pencarian baris transaksi, dan isi detail kalender dipertahankan.
- Pemeriksaan yang dilakukan: modul kalender dan controller lolos parse sintaks JavaScript. Suite runtime/test tidak dijalankan.

## 6. Batas keselamatan

Pemetaan ini tidak mengusulkan perubahan pada endpoint/API, kontrak data, hitungan aging/prioritas, nilai piutang, sumber data, generator PDF, atau pesan WhatsApp. Tujuan tahap berikutnya adalah memindahkan kode dengan perilaku yang sama, bukan mengubah hasil atau alur pengguna.
