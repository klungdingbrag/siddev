# Pemetaan Fungsi Dashboard dan Piutang

**Branch:** `ui/ux-polish-v3`  
**Tanggal pemetaan terbaru:** 16 Oktober 2026  
**Tujuan:** Menentukan batas modul yang aman untuk perawatan bertahap.  
**Ruang lingkup:** Peta awal audit UI dan catatan ekstraksi renderer grafik Dashboard.

## Snapshot sumber

| File | Baris | Blob SHA snapshot terbaru |
|---|---:|---|
| `assets/js/pages/dashboard.js` | 530 | `ae436e3f308278501b4274b15b166c425736817a` |
| `assets/js/pages/dashboard/calendar.js` | 98 | `6298fb757d00edc67c0fa6c4b3b025c0dcc136d8` |
| `assets/js/pages/dashboard/charts.js` | 342 | `e672e0dfc131881ad196503838ffd09b8565e592` |
| `assets/js/pages/piutang.js` | 1014 | `593d07cb9589bfe26a6a1420062fc8617fbacf5c` |
| `assets/js/pages/piutang/pdf-utils.js` | 78 | `489321bbffcd89cb4419929fc81967fc86e1df0f` |
| `assets/js/pages/piutang/list-renderers.js` | 17 | `ef1c469e1ecea7579617bb09c43986b5ac7be106` |

Rentang baris merujuk pada source yang diambil dari branch `ui/ux-polish-v3` pada 16 Oktober 2026. Perubahan berikutnya dapat menggeser rentang.

## 1. Dashboard

### Peta tanggung jawab

| Baris | Fungsi/kelompok | Tanggung jawab |
|---|---|---|
| 1–20 | Import, konstanta, `dashboardState` | Import endpoint dan renderer; konfigurasi periode/cache serta state Dashboard. |
| 22–63 | Rentang tanggal dan formatter | Membentuk rentang bulan/tahun dan format rupiah. |
| 64–108 | Cache Dashboard | Membaca, menulis, memulihkan state melalui `sessionStorage`. |
| 110–180 | Escape, normalisasi, dan total piutang | Escape HTML, label bulan, normalisasi data omzet/laba, dan membaca total piutang dari respons API. |
| 182–304 | `buildDashboardShell()` | Markup halaman, KPI, panel grafik/kalender, dan kontrol periode. |
| 306–363 | Kontrol dan helper UI | Kontrol periode, loading, mount check, set teks, dan dependency object untuk renderer. |
| 364–443 | `renderDashboardData()` | Membentuk KPI, menormalisasi data untuk renderer, dan mengirim periode/helper ke modul tampilan. |
| 445–512 | `loadDashboard()` | Cache, request API, state, error, dan KPI piutang. |
| 514–530 | `renderDashboardPage()` | Entry point router; membuat shell, mengikat periode, memulihkan cache/memuat data. |
| Modul terpisah | `dashboard/calendar.js`, `dashboard/charts.js` | Kalender beserta interaksi klik; grafik omzet/laba beserta tooltip dan rekonsiliasi laba harian. |

### Alur data

`renderDashboardPage()` → shell dan event kontrol → `loadDashboard()` → endpoint `dashboardSalesDaily`, `dashboardProfitMonthly`, `dashboardProfitDaily`, dan `piutang` → normalisasi dan state → `renderDashboardData()` → KPI, grafik, dan kalender.

### Batas pemisahan yang disarankan

- Pertahankan `renderDashboardPage()` sebagai entry point yang diekspor dan `loadDashboard()` sebagai pengatur state/API.
- Renderer grafik telah dipindahkan ke `assets/js/pages/dashboard/charts.js`; formatter, escape, dan helper teks tetap dimiliki controller dan diberikan sebagai dependency.
- Renderer kalender sudah dipindahkan ke `assets/js/pages/dashboard/calendar.js`; periode dan helper dikirim oleh controller.
- Pertahankan key dan format cache, urutan request, penanganan error, ID/class DOM, serta nama endpoint.
- Tetap jaga sumber state/cache dan request pada controller. Perubahan lanjutan di modul grafis/kalender harus mempertahankan format data dan hasil yang tampil.

## 2. Piutang

### Peta tanggung jawab

| Baris | Fungsi/kelompok | Tanggung jawab |
|---|---|---|
| 1–62 | Import, state, format/cache constants, mount helper | API dan renderer list/PDF, state daftar/detail, formatter, escape, cache key/TTL, serta identifikasi mount halaman. |
| 64–90 | `renderPiutangPage()` | Entry point; membuat seluruh shell daftar, modal, lalu mengikat event dan memulai pemuatan. |
| 92–163 | `bindEvents()` | Event pencarian, filter, sort, ukuran halaman, paging, klik detail, PDF, WhatsApp, dan modal. |
| 165–319 | `loadPiutang()`, refresh dan cache | Memuat/memperbarui data, menjaga mount, menerapkan data, cache, serta status refresh. |
| 320–355 | Envelope dan ringkasan | Memilih array pelanggan dari bentuk respons yang didukung, menghitung saldo/current/overdue, dan memanggil ringkasan prioritas. |
| 356–421 | Prioritas collection | Aturan bucket/umur, ranking, metadata label, dependency markup list, jumlah per prioritas, dan active filter UI. |
| 423–474 | Filter, sort, aging bucket | Pencarian, filter aging/prioritas, sortir dan pembatasan halaman aktif. |
| 475–504 | `renderTable()` | Empty state, DOM daftar, paging, dan delegasi markup ke modul template. Tetap di controller. |
| Modul terpisah | `piutang/list-renderers.js` | `renderPiutangRow()` dan `renderPiutangCard()` menghasilkan markup tabel/kartu dengan dependency eksplisit. |
| 506–681 | Detail pelanggan | Buka detail dan request terkait, parsing tabungan/transaksi, markup detail/aging/nota. |
| 682–789 | PDF actions | Memilih aksi dan menjalankan request invoice/ringkasan/detail 6D.2, lalu menampilkan hasil/errors. |
| Modul terpisah | `piutang/pdf-utils.js` | Extract payload, decode/convert base64, dan validasi byte PDF; tanpa state atau DOM. |
| 790–842 | Efek UI PDF | Overlay loading, open/download file, dan revoke object URL. |
| 843–994 | WhatsApp dan modal | Menyusun pesan pelanggan/nota, membuka click-to-chat, event modal, dan tutup detail. |
| 995–1014 | Status dan toast | Menampilkan status daftar serta toast global. |

### Alur utama

- **Daftar:** render halaman → event → load/cache → normalisasi → ringkasan/prioritas → filter/sort → tabel atau kartu.
- **Detail:** klik pelanggan → `openDetail()` → endpoint detail/tabungan → normalisasi → `renderDetail()`.
- **PDF:** aksi detail → endpoint PDF → validasi byte → unduh.
- **WhatsApp:** aksi → pemilih kontak → susun pesan → buka WhatsApp.

### Batas dependency: detail, PDF, dan WhatsApp

| Area | Fungsi | Dependency utama | Batas yang aman |
|---|---|---|---|
| Detail data | `openDetail()`, `extractTabungan()`, `extractTransactions()`, `customerValue()` | `state`, endpoint `customerPiutangDetail`/`tabungan`, request id, fallback envelope | Request dan mutasi state tetap di `piutang.js`; normalisasi jangan diubah tanpa audit kontrak respons. |
| Detail UI | `renderDetail()`, `agingCard()`, `invoiceRowHtml()` | state tabungan/kode, formatter/escape, detail DOM, event tutup, aksi `data-pdf-action`/`data-wa-action` | Tetap satu alur controller untuk sekarang; markup membentuk target event untuk PDF/WhatsApp. |
| PDF action | `handlePdfAction()`, `generatePdf6D2()`, `generatePdf()` | endpoint PDF, overlay loading, toast, browser window/download | Tetap di controller agar alur API dan efek browser tidak terpecah. |
| Utilitas PDF | `extractPdfPayload()`, `base64ToBytes()`, `base64ToBlob()`, `containsAscii()`, `validatePdfBytes()` | envelope respons, base64, Web APIs `atob`, `Blob`, `TextEncoder` | Sudah dipindahkan ke `piutang/pdf-utils.js`; fungsi ini tidak membaca state atau DOM. |
| PDF UI | `setPdfLoading()`, `downloadBlob()` | `document`, `URL`, DOM overlay, browser download | Tetap di controller karena punya efek samping UI/browser. |
| WhatsApp | `buildWhatsAppMessage()`, `formatWhatsAppReportDate()`, `openWhatsAppPicker()` | state detail/tabungan, `extractTransactions()`, `customerValue()`, format rupiah | Tetap di controller; jangan pindahkan teks atau hitungan bersamaan dengan ekstraksi utilitas lain. |
| Link WhatsApp | `openWhatsApp()` | URL click-to-chat dan browser `window.open` | Perubahan endpoint `wa.me` sudah terisolasi; jangan gabungkan dengan perubahan isi pesan. |
| WhatsApp dan modal | `openWhatsAppPicker()`, `buildWhatsAppMessage()`, `formatWhatsAppReportDate()`, `openWhatsApp()`, modal handlers | state detail, transaksi, format uang, URL, `window.open`, dan modal | Pertahankan konten dan hitungan; URL `wa.me` sudah terverifikasi pengguna. |

### Batas pemisahan yang disarankan

- Pertahankan `renderPiutangPage()` sebagai entry point router.
- `rowHtml()` dan `cardHtml()` telah dipindahkan ke `assets/js/pages/piutang/list-renderers.js` sebagai `renderPiutangRow()` dan `renderPiutangCard()`. Dependency `{ collectionPriorityMeta, esc, formatMoney }` dikirim dari controller.
- `renderTable()` tetap di `piutang.js` karena ia mengelola empty state, DOM, paging, dan state. `filterAndRender()`, `highestAgingBucket()`, aturan prioritas, serta semua event tetap di controller.
- Untuk pemeliharaan berikutnya, jaga string HTML, urutan kolom/kartu, class/ID, `data-code`, dan tombol detail tetap sama. Perubahan ini tidak mengubah copy, angka, filter, sort, maupun paging.
- Detail dan WhatsApp tetap di controller karena bergantung pada state detail dan saling membentuk target aksi. PDF juga tetap di controller pada sisi request/loading/download; kandidat berikutnya hanya utilitas pemrosesan payload dan validasi byte.
- Jangan mengubah ID, class, `data-*` attributes, urutan event, format uang, fallback envelope API, dan urutan panggilan endpoint.

## 3. Urutan refactor yang aman

1. Ekstraksi renderer grafik dan kalender Dashboard telah selesai sebagai perubahan terpisah.
2. Peta source diperbarui pada 16 Oktober 2026. Ekstraksi template daftar Piutang selesai; filter, state, prioritas, paging, dan DOM controller tetap di `piutang.js`.
3. Utilitas PDF sudah diekstrak. Langkah berikutnya adalah memeriksa PDF invoice, ringkasan, dan detail 6D.2 di front-end; request, overlay, download, dan toast tetap di controller.
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

## 6. Status pemetaan ulang source

Audit baca-saja branch `ui/ux-polish-v3` pada 16 Oktober 2026 memperbarui snapshot dan rentang fungsi di atas. Untuk daftar Piutang, template tabel/kartu tidak menghitung prioritas sendiri; keduanya memanggil `collectionPriorityMeta()` dan memakai `esc()` serta `formatMoney()`. Karena itu dependency tersebut perlu disuntikkan, sedangkan pagination/empty-state tetap di controller.

## 7. Status implementasi: ekstraksi template daftar Piutang

- Ditambahkan `assets/js/pages/piutang/list-renderers.js` untuk template baris desktop dan kartu mobile.
- `piutang.js` memberi formatter, escape, dan metadata prioritas sebagai dependency; tidak ada state baru.
- `renderTable()`, filtering/sorting, pagination, prioritas, markup shell, dan event tetap di controller.
- Pemeriksaan yang dilakukan: kedua source lolos parse sintaks JavaScript. Suite runtime/test tidak dijalankan.

## 8. Status perbaikan tautan WhatsApp

- Pemeriksaan source tidak menemukan literal HTML entity dalam builder pesan; builder pesan tidak diubah.
- URL share dialihkan dari `api.whatsapp.com/send/` ke `https://wa.me/` dan parameter `text` disusun menggunakan `URL.searchParams`.
- Ini mengikuti format click-to-chat WhatsApp dengan teks prefilled URL-encoded. Perlu verifikasi manual pada kolom pesan WhatsApp untuk memastikan entity tidak lagi muncul.
- Pemeriksaan yang dilakukan: `piutang.js` lolos parse sintaks JavaScript. Tes langsung ke WhatsApp tidak dijalankan.

## 9. Status audit detail, PDF, dan WhatsApp

Audit baca-saja menunjukkan alur detail menggabungkan request paralel, validasi request id, state, markup modal, dan event action. Builder WhatsApp memakai state detail dan parser transaksi. Karena itu kedua alur tetap di controller. Utilitas PDF dipisahkan sendiri; pemanggilan endpoint, overlay, download, dan toast tetap di controller.

## 10. Status implementasi: utilitas PDF

- Ditambahkan `assets/js/pages/piutang/pdf-utils.js` untuk ekstraksi payload, dekode base64, konversi Blob, dan validasi marker PDF.
- `piutang.js` tetap mengatur endpoint PDF, validasi alur 6D.2, overlay loading, pembukaan/unduhan dokumen, dan notifikasi.
- Perubahan ini hanya pemindahan fungsi; kontrak data dan output PDF tidak diubah.
- Pemeriksaan yang dilakukan: kedua source lolos parse sintaks JavaScript. PDF tidak diuji langsung pada aplikasi.

## 11. Batas keselamatan

Pemetaan ini tidak mengusulkan perubahan pada endpoint/API, kontrak data, hitungan aging/prioritas, nilai piutang, sumber data, generator PDF, atau pesan WhatsApp. Tujuan tahap berikutnya adalah memindahkan kode dengan perilaku yang sama, bukan mengubah hasil atau alur pengguna.
