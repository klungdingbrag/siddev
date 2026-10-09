# TB NUSANTARA — SID Retail Development

> **Project:** TB Nusantara SID Retail  
> **Repository:** `klungdingbrag/siddev`  
> **Current milestone:** Frontend V1 + Development Backend Integration  
> **Stable baseline:** `stable/2026-10-05`  
> **Current active branch:** `main`  
> **Status:** Stable foundation / `main` is the active branch for `admin.tbnusantara.com`

---

## 1. Tentang Proyek

Repository ini adalah bagian dari pengembangan sistem internal **TB Nusantara SID Retail**.

Tujuan utamanya adalah memisahkan **frontend/UI** dari **backend/business logic** tanpa mengganti SID Retail sebagai sumber data transaksi.

Arsitektur yang digunakan:

```text
                    TB NUSANTARA
                         |
                         v
                +------------------+
                |     FRONTEND     |
                |      GitHub      |
                |                  |
                | UI / UX          |
                | Dashboard        |
                | Piutang          |
                | Pelanggan*       |
                | Data Barang*     |
                +--------+---------+
                         |
                         | HTTPS / API
                         v
                +------------------+
                |     BACKEND      |
                | Google Apps      |
                | Script (GAS)     |
                |                  |
                | API Router       |
                | Business Logic   |
                | PDF Generator    |
                | Accounting Rule  |
                +--------+---------+
                         |
                         | SID API / SQL
                         v
                +------------------+
                |    SID RETAIL    |
                |                  |
                | Transaction Data |
                | Customer Data    |
                | Piutang          |
                | Inventory        |
                +------------------+

* modul berikutnya / belum menjadi milestone stable saat ini
```

**Prinsip utama:** frontend tidak mengakses database secara langsung. Frontend meminta data melalui backend API.

---

## 2. Production vs Development

Project ini menggunakan pemisahan yang tegas antara Production dan Development.

### Production

Production diperlakukan sebagai sistem yang sudah berjalan dan **frozen**.

```text
PRODUCTION
    |
    +-- FROZEN
    |
    +-- Tidak menjadi tempat eksperimen
    |
    +-- Perubahan hanya untuk bug fix yang benar-benar diperlukan
```

### Development

Development adalah tempat pengembangan dan pengujian:

```text
GitHub Frontend
       |
       +---- Development GAS
                    |
                    +---- SID Retail
```

Perubahan fitur baru harus diuji di Development terlebih dahulu.

---

## 3. Status Milestone 2026-10-02

Milestone ini menyatakan bahwa fondasi frontend/backend dan modul yang sudah diuji telah mencapai kondisi stabil.

### Sudah berhasil

- Frontend terpisah dari backend.
- Frontend dapat berjalan dari repository GitHub.
- Development Google Apps Script dapat menjadi API backend.
- API router Development berjalan.
- Koneksi backend ke SID Retail berhasil.
- Validasi konfigurasi Development berhasil.
- Data Piutang dapat diambil dari backend.
- Daftar pelanggan dengan piutang dapat ditampilkan.
- Detail piutang pelanggan dapat ditampilkan.
- Data tabungan pelanggan dapat diintegrasikan pada detail pelanggan.
- PDF Ringkasan Piutang tersedia.
- PDF seluruh detail piutang 6D.1 tersedia.
- PDF seluruh detail piutang 6D.2 tersedia.
- PDF Invoice tersedia.
- Transport PDF dari backend ke frontend sudah diperbaiki dan divalidasi.
- WhatsApp customer tersedia.
- Loading state dan feedback UI telah dipoles.
- Modal detail pelanggan telah diperbaiki.
- Piutang menggunakan caching **Stale-While-Revalidate (SWR)** di frontend.
- Production tidak digunakan sebagai tempat eksperimen untuk milestone ini.

### Yang dimaksud "Stable"

Stable berarti komponen yang termasuk milestone ini telah diuji dan dinyatakan layak menjadi fondasi pengembangan berikutnya.

Stable **bukan berarti seluruh aplikasi sudah selesai**.

---

## 4. Accounting Contract

SID Retail tetap menjadi sumber kebenaran transaksi.

Untuk laporan piutang:

```text
Total Invoice
= penjualan.jumlah

Saldo Hutang
= penjualan.piutang

Total Dibayar
= Total Invoice - Saldo Hutang
```

`itempiutang` digunakan sebagai **validation / cross-check**, bukan sebagai sumber utama untuk merekonstruksi saldo hutang pelanggan.

Prinsip ini harus dipertahankan pada:

- PDF Invoice
- PDF 6D.1
- PDF 6D.2
- Ringkasan Piutang
- WhatsApp Invoice
- Modul lain yang menggunakan informasi saldo transaksi

Jika diperlukan perubahan terhadap accounting logic, perubahan tersebut harus melalui audit dan pengujian terlebih dahulu.

---

## 5. Backend API

Backend Development menyediakan API terkontrol untuk frontend.

API V1 yang telah digunakan dalam milestone ini mencakup:

- `health`
- `validateConfig`
- `piutang`
- `customerPiutangDetail`
- `tabungan`
- `pdfRingkasanPiutang`
- `pdfSemuaDetailPiutang6D1`
- `pdfSemuaDetailPiutang6D2`
- `pdfInvoice`

Terdapat juga pengujian koneksi SID Retail melalui backend untuk memastikan jalur:

```text
Frontend
  -> GAS API
  -> SID API
  -> SQL / SID response
  -> GAS
  -> Frontend
```

berfungsi sebagaimana mestinya.

Frontend tidak diperbolehkan membuat query SQL langsung ke SID Retail.

---

## 6. PDF Architecture

PDF dibuat di backend dan dikirim ke frontend sebagai data yang dapat ditransport melalui API.

Komponen PDF yang telah diuji:

### PDF Invoice

Untuk satu transaksi/invoice.

### PDF Ringkasan Piutang

Untuk ringkasan piutang pelanggan.

### PDF 6D.1

Laporan detail piutang dengan jalur generator 6D.1 yang telah ditetapkan sebagai bagian dari backend stable.

### PDF 6D.2

Laporan detail piutang dengan accounting summary yang menggunakan:

```text
Total Invoice
Total Dibayar
Total Saldo Hutang
```

Transport PDF frontend telah diperkuat dengan validasi byte PDF sehingga masalah data PDF yang terpotong dapat dideteksi sebelum file digunakan.

---

## 7. WhatsApp

WhatsApp digunakan sebagai jalur komunikasi customer-facing.

Untuk informasi invoice, prinsip data mengikuti accounting contract:

```text
Total Invoice
Sudah Dibayar
Saldo Hutang
```

WhatsApp tidak boleh membuat perhitungan saldo sendiri yang bertentangan dengan data server.

---

## 8. Frontend Architecture

Struktur frontend saat ini:

```text
siddev/
├── index.html
├── README.md
└── assets/
    ├── css/
    │   ├── app.css
    │   └── ui-polish.css
    ├── img/
    │   └── .gitkeep
    └── js/
        ├── app.js
        ├── config.js
        ├── ui-polish.js
        ├── api/
        │   ├── client.js
        │   └── endpoints.js
        └── pages/
            ├── dashboard.js
            └── piutang.js
```

### Tanggung jawab

**`app.js`**

Routing halaman frontend.

**`api/client.js`**

Transport dan komunikasi HTTP dengan backend.

**`api/endpoints.js`**

Daftar endpoint yang digunakan frontend.

**`pages/piutang.js`**

UI, state, filtering, pagination, detail pelanggan, PDF action, dan WhatsApp action untuk modul Piutang.

**`ui-polish.js` / `ui-polish.css`**

Feedback visual, loading state, interaction, responsive behavior, modal, button state, dan polish UI.

---

## 9. Caching Piutang

Modul Piutang menggunakan pola:

**Stale-While-Revalidate (SWR)**

Cache disimpan di `sessionStorage`.

TTL saat ini:

```text
2 menit
```

Perilaku:

```text
                    Buka Piutang
                         |
              +----------+----------+
              |                     |
          Cache ada?            Cache tidak ada
              |                     |
        +-----+-----+               |
        |           |               |
      Fresh       Stale             |
      < 2 min     > 2 min            |
        |           |                |
        v           v                v
     Tampilkan   Tampilkan       Fetch backend
     langsung    cache           + tampilkan
                    |
                    v
             Background refresh
```

### Tujuan

- Mengurangi request backend berulang.
- Membuat perpindahan Dashboard → Piutang lebih cepat.
- Tetap memungkinkan data diperbarui.
- Menyediakan tombol **Refresh** untuk memaksa pengambilan data terbaru.

Cache adalah optimasi frontend. Cache tidak menjadi sumber kebenaran accounting.

Jika refresh background gagal tetapi cache tersedia, data terakhir tetap dapat ditampilkan.

---

## 9A. Dashboard Analytics V1

Dashboard Analytics V1 kini dikonsolidasikan menjadi satu file backend:

`code/Dashboard_Analytics_V1.gs`

File ini memuat dua kelompok fungsi:

### Analytics

- `getDashboardSalesDaily_V1()`
- `getDashboardSummary_V1()`
- `inspectDashboardProfitSource_V1()`
- `testDashboardAnalytics_V1()`

### Audit / Rekonsiliasi

- `testDashboardSalesMapping()`
- `testDashboardProfitMapping()`
- `testDashboardAnalyticsAudit()`
- `auditDashboardProfitSeptember_V1()`

Mapping Dashboard yang telah direkonsiliasi dengan SID Retail untuk September 2026:

```text
Omzet harian
    -> penjualan.jumlah

Laba bulanan
    -> SUM(labarugi.labarugi)
```

Grafik Laba POS September 2026 menghasilkan **Rp84.787.006,74**, sama dengan hasil `SUM(labarugi.labarugi)` pada periode yang sama.

Fungsi audit dipertahankan sebagai alat validasi dan tidak menjadi sumber business logic baru. Penggabungan file hanya merapikan organisasi source code; fungsi yang telah berhasil diuji tidak dihapus atau diubah perilakunya.

---

## 9B. Dashboard Sales View Roadmap (Planned)

Pengembangan berikutnya yang **direncanakan, tetapi belum menjadi pekerjaan aktif**, adalah memperluas grafik **Aktivitas Penjualan / Omzet** agar dapat melihat data pada beberapa tingkat waktu.

Konsep yang disimpan sebagai roadmap:

```text
Aktivitas Penjualan
        |
        +-- Harian
        |     +-- default: bulan berjalan
        |     +-- bulan sebelumnya / pilih bulan
        |
        +-- Bulanan
        |     +-- 3 bulan
        |     +-- 6 bulan
        |     +-- 12 bulan
        |
        +-- Tahunan
              +-- beberapa tahun
```

### Rencana backend

Fungsi yang sudah ada dan telah diuji:

- `getDashboardSalesDaily_V1()` — tetap menjadi sumber untuk tampilan harian.

Jika roadmap ini direalisasikan, pendekatan yang direncanakan adalah menambahkan fungsi terpisah:

- `getDashboardSalesMonthly_V1()`
- `getDashboardSalesYearly_V1()`

Beserta endpoint API yang sesuai.

**Fungsi `getDashboardSalesDaily_V1()` tidak perlu diganti.** Tampilan 3 bulan, 6 bulan, atau 12 bulan dapat menggunakan agregasi bulanan; tidak perlu membuat fungsi khusus untuk setiap jumlah bulan.

### Prinsip implementasi

- Tidak mengubah definisi omzet yang sudah diaudit.
- Tidak mengubah accounting logic.
- Tidak mengganggu Dashboard harian yang sudah stabil.
- Backend tetap menjadi tempat agregasi data.
- Frontend hanya memilih periode dan menampilkan hasil.
- Implementasi hanya dilakukan jika kebutuhan bisnisnya sudah jelas dan memang diperlukan.

Roadmap ini **belum merupakan commitment implementasi**. Untuk saat ini Dashboard yang sudah stabil tetap dipertahankan tanpa penambahan fungsi tersebut.

---

## 9B. Dashboard Architecture V1

Dashboard diperlakukan sebagai modul SPA yang memiliki state, cache, lifecycle, dan asynchronous request isolation sendiri.

### Data Dashboard

    Dashboard
       |
       +-- Omzet Harian
       |      |
       |      +-- penjualan.jumlah
       |      +-- jumlah transaksi
       |
       +-- Laba Bulanan
       |      |
       |      +-- SUM(labarugi.labarugi)
       |
       +-- Piutang Berjalan
              |
              +-- API Piutang V1

Frontend menggunakan endpoint:
- dashboardSalesDaily
- dashboardProfitMonthly
- dashboardSummary

Backend implementation berada di:
code/Dashboard_Analytics_V1.gs

Omzet harian menggunakan bulan yang sedang dipilih. Laba bulanan menggunakan rentang Januari sampai bulan terpilih pada tahun yang dipilih.

Grafik omzet harian memiliki hover/pointer interaction, vertical crosshair, focus point, tooltip tanggal, nilai omzet, dan jumlah transaksi. Chart dibangun di frontend tanpa library chart eksternal.

---

## 9C. Dashboard Cache

Dashboard menggunakan cache sessionStorage dengan TTL 5 menit.

Cache disimpan per periode:

    sidretail:dashboard:v1:YYYY-MM

Contoh:

    sidretail:dashboard:v1:2026-09

Perilaku:

    Masuk Dashboard
           |
           v
       Ada cache?
        /       \
      Tidak      Ya
       |          |
       |       Umur < 5 menit?
       |        /        \
       |      Ya          Tidak
       |       |            |
       |   Render cepat   Render cache
       |                  + refresh
       v
    Fetch backend
       |
       v
    Render + cache

Tombol Refresh selalu memaksa request backend terbaru.

Cache tidak pernah menjadi source of truth. Ia hanya mempercepat UX dan mengurangi request berulang.

---

## 9D. SPA Lifecycle dan Stale Request Protection

Aplikasi menggunakan satu #page-content sebagai mount point untuk halaman.

Karena request backend bersifat asynchronous, request dari halaman lama dapat selesai setelah user sudah pindah halaman.

Contoh masalah yang pernah terjadi:

    Piutang dibuka
          |
          +---- api.piutang() berjalan
          |
          v
    User pindah ke Dashboard
          |
          v
    DOM Piutang sudah dihancurkan
          |
          v
    Request Piutang selesai
          |
          v
    Kode lama mencoba:
    #sum-customers.textContent = ...
          |
          X
    Cannot set properties of null

### Solusi

Setiap mount Piutang mendapatkan mount ID.

Sebelum hasil asynchronous request digunakan, frontend memeriksa apakah request tersebut masih berasal dari halaman yang aktif.

Konsep:

    const mountId = piutangMountId;

    const result = await api.piutang();

    if (!isPiutangMounted(mountId)) return;

Dengan demikian request lama tidak boleh memodifikasi DOM halaman baru.

Dashboard juga memiliki dashboardIsMounted() dan helper setDashboardText(selector, value) untuk mencegah akses langsung ke elemen DOM yang sudah tidak tersedia.

### Lifecycle rule

    Async request
         |
         v
    Apakah halaman masih aktif?
         |
       +---+---+
       |       |
      Ya     Tidak
       |       |
       v       v
    Render   Ignore

Ini adalah bagian arsitektur SPA, bukan sekadar workaround error.

---

## 9E. Route Isolation

Routing frontend dikendalikan oleh app.js.

Route saat ini:

    #dashboard
    #piutang
    #pelanggan
    #barang
    #kalkulator

Setiap route memiliki renderer sendiri:

    #dashboard  -> renderDashboardPage()
    #piutang    -> renderPiutangPage()
    #pelanggan  -> coming soon
    #barang     -> coming soon
    #kalkulator -> coming soon

Halaman yang belum aktif tidak menjalankan request Dashboard atau Piutang.

Module halaman tidak boleh menganggap DOM halaman lain masih tersedia.

Untuk operasi DOM asynchronous, gunakan null guard. Untuk request yang lebih kompleks, gunakan mount/lifecycle guard.

---

## 9F. Piutang Cache + Refresh Architecture

Piutang menggunakan SWR dengan TTL 2 menit.

### Automatic/background refresh

    Cache stale
       |
       +-- tampilkan cache
       |
       +-- request backend di background
       |
       +-- berhasil -> update
       |
       +-- gagal -> pertahankan data lama + toast

### Manual Refresh

Tombol Refresh selalu meminta data terbaru dari backend.

Data lama tetap dipertahankan selama proses refresh sehingga UI tidak perlu kembali kosong.

---

## 9G. Prinsip Asynchronous UI

Semua halaman yang melakukan request asynchronous harus mempertimbangkan:

1. Request masih berjalan.
2. User berpindah halaman.
3. Request selesai setelah DOM berubah.

Pattern:

    START REQUEST
         |
         v
    REQUEST RUNNING
         |
         +---- route berubah ----> OLD REQUEST
         |                            |
         |                            v
         |                       IGNORE RESULT
         |
         v
    REQUEST SELESAI
         |
         v
    CHECK MOUNT
         |
         v
       RENDER

Tujuannya mencegah:
- Cannot set properties of null
- stale data masuk ke halaman lain
- loading state halaman lama memengaruhi halaman baru
- response lama menimpa state baru

---

## 9H. Frontend State vs Backend Source of Truth

Frontend mempunyai state sementara seperti dashboardState, state Piutang, sessionStorage cache, loading state, filter state, dan pagination state.

Semua state tersebut bukan sumber kebenaran transaksi.

    SID Retail
        |
        | source of truth
        v
    GAS Backend
        |
        | API contract
        v
    Frontend State
        |
        v
    UI / Cache

Jika cache dan server berbeda, server tetap menjadi referensi utama.

---

## 9I. Riwayat Perbaikan Frontend Penting

| Masalah | Solusi |
|---|---|
| Dashboard tampil pada route lain | Route isolation di app.js |
| Response Dashboard terlambat menyentuh halaman lain | Dashboard mount guard |
| textContent Dashboard pada elemen yang sudah hilang | Safe DOM setter |
| Piutang selalu request ulang | SWR cache |
| Refresh Piutang tidak selalu memaksa request | Manual refresh path |
| Loading spinner tidak terlihat/berputar | Dedicated spinner CSS |
| Icon action tampil sebagai karakter kotak | Inline SVG |
| Modal detail tertutup ketika backdrop diklik | Close hanya melalui tombol |
| Loading detail tidak berputar | Dedicated detail spinner |
| Request Piutang lama menyentuh Dashboard setelah route berubah | Piutang mount ID / stale request guard |

Perbaikan terakhir untuk stale Piutang request:

    0d2390f742a583642f40419ce25b0f5c28cc3c52

Commit:

    fix: isolate stale piutang requests across routes

---

## 9J. Development Pattern yang Sekarang Dipakai

Untuk membuat halaman baru:

    1. Route
       |
    2. Page renderer
       |
    3. Page state
       |
    4. API endpoint
       |
    5. Loading state
       |
    6. Async request
       |
    7. Mount/lifecycle guard
       |
    8. Render result
       |
    9. Error state
       |
    10. Cache bila diperlukan

Jangan langsung membuat pola request asynchronous yang mengasumsikan elemen DOM pasti masih ada setelah await.

---

## 9K. Responsive UI Foundation V1

Responsive behavior menggunakan **DOM dan route yang sama** untuk desktop dan mobile. Tidak dibuat aplikasi mobile terpisah.

### Desktop

Sidebar bersifat persistent:

    Sidebar
       |
       +---- App Shell
                |
                +---- Topbar
                +---- Page Content

### Mobile

Sidebar berubah menjadi **off-canvas navigation drawer**:

    Mobile Topbar
       |
       +-- Menu button
       |
       v
    Navigation Drawer
       |
       +-- Dashboard
       +-- Pelanggan
       +-- Piutang
       +-- Data Barang
       +-- Kalkulator

Drawer dapat ditutup melalui:
- tombol X,
- overlay,
- pemilihan menu,
- tombol Escape.

### Prinsip responsive

Responsive bukan sekadar mengecilkan ukuran desktop.

Yang berubah pada mobile adalah **interaction model**, sementara halaman, route, state, dan API tetap sama.

    Desktop
    Persistent Sidebar
          |
          v
       Content

    Mobile
    Menu Button
          |
          v
    Temporary Drawer
          |
          v
       Content

### Komponen yang sudah dipersiapkan

- mobile navigation drawer,
- mobile topbar,
- touch-friendly navigation,
- responsive KPI cards,
- responsive Dashboard controls,
- responsive Dashboard charts,
- responsive Piutang cards,
- responsive modal,
- responsive search/filter,
- touch target minimum sekitar 44px pada kontrol utama,
- pencegahan horizontal overflow pada app shell,
- reduced-motion support.

### Prinsip kompatibilitas

Perubahan responsive tidak mengubah:

- API contract,
- accounting logic,
- PDF generation,
- WhatsApp behavior,
- Piutang caching,
- Dashboard caching,
- route architecture,
- backend GAS.

Responsive layer hanya mengubah presentasi dan interaction shell.

---

## 9L. Deployment dan Custom Domain

Frontend pada GitHub Pages telah dikonfigurasi menggunakan **custom domain**:

```text
admin.tbnusantara.com
```

Domain tersebut digunakan sebagai alamat akses frontend/admin SID Retail yang dipublikasikan melalui GitHub Pages.

Arsitektur deployment:

```text
User / Browser
      |
      v
admin.tbnusantara.com
      |
      v
GitHub Pages
      |
      v
Frontend SID Retail
      |
      | HTTPS / API
      v
Development GAS Backend
      |
      v
SID Retail API / POS Server
```

### Prinsip

- Custom domain merupakan alamat publik untuk frontend.
- GitHub Pages berfungsi sebagai host frontend/static application.
- Custom domain tidak menggantikan backend GAS.
- Frontend tetap berkomunikasi dengan backend melalui API.
- Perubahan domain/hosting tidak boleh mengubah accounting logic atau source of truth.
- Konfigurasi domain harus dipisahkan dari credential dan secret backend.

### Status

```text
Custom domain
    admin.tbnusantara.com
          |
          v
      GitHub Pages
          |
          v
   SID Retail Frontend
```

**Status: sudah dikonfigurasi dan digunakan.**


---

## 10. Prinsip Data

Beberapa prinsip yang harus dijaga:

1. **SID Retail adalah source of truth untuk transaksi.**
2. Backend menjadi lapisan akses dan business logic.
3. Frontend bertanggung jawab atas presentasi dan interaksi.
4. Frontend tidak boleh menggantikan accounting logic backend.
5. Cache tidak boleh dianggap sebagai data permanen atau sumber kebenaran.
6. Perubahan terhadap struktur API harus dipertimbangkan terhadap seluruh consumer frontend.
7. Data anomaly harus dibedakan dari bug program dan tidak boleh diperbaiki secara asumtif.

---

## 11. Git Workflow

GitHub digunakan sebagai **historical record** proyek.

Alur perubahan:

```text
IDEA
  |
  v
BRANCH
  |
  v
CODE
  |
  v
TEST
  |
  v
COMMIT
  |
  v
REVIEW
  |
  v
MERGE
```

Perubahan tidak dilakukan dengan pola copy-paste manual sebagai sumber sejarah utama.

Setiap perubahan penting harus mempunyai commit yang dapat dilacak.

### Branch penting

- `main` — branch utama repository.
- `stable/2026-10-02` — baseline stable untuk milestone 2026-10-02.
- `ui/ux-polish-v1` — pengembangan UI/UX dan caching saat ini.
- `dev/frontend-v1` — pengembangan frontend V1.
- `fix/pdf-transport-v2` — pekerjaan hardening transport PDF.
- `backend/gas-development-source-v1` — sumber backend Development yang disimpan di repository.

Branch dapat berkembang, tetapi baseline stable tidak boleh dianggap berubah hanya karena development berlanjut.

---

## 12. Change Control

Setelah sebuah komponen dinyatakan stable:

### Jangan

- Mengubah accounting logic hanya untuk kebutuhan UI.
- Mengganti SQL yang sudah tervalidasi tanpa audit.
- Menguji eksperimen langsung di Production.
- Menghapus fungsi lama hanya karena belum digunakan frontend baru tanpa pemeriksaan dependency.
- Membuat ulang API yang sudah stabil tanpa alasan.
- Menyimpan credential atau API key ke repository.

### Lakukan

- Buat branch baru untuk perubahan.
- Buat commit yang jelas.
- Test di Development.
- Review diff.
- Pastikan fitur lama tidak rusak.
- Baru pertimbangkan merge ke baseline berikutnya.

---

## 13. Security

Credential, API key, Script ID sensitif, dan konfigurasi rahasia **tidak boleh dimasukkan ke repository publik**.

Gunakan:

- Google Apps Script Script Properties
- konfigurasi Development yang aman
- template configuration untuk dokumentasi

File credential lokal atau secret tidak boleh menjadi bagian dari source control.

---

## 14. Development Rules

Beberapa aturan kerja yang telah disepakati:

### Backend GAS

Production function yang sudah stable dianggap frozen kecuali terdapat bug yang benar-benar perlu diperbaiki.

Perubahan backend harus terisolasi dan jelas.

Fungsi GAS baru yang dibuat untuk penggunaan/manual testing tidak menggunakan suffix trailing underscore `_`, karena fungsi tersebut perlu dapat terlihat pada Run dropdown GAS.

### Frontend

Perubahan UI dilakukan melalui branch GitHub.

Frontend dapat dikembangkan lebih cepat tanpa mengubah backend selama API contract tetap sama.

---

## 15. Testing Philosophy

Testing tidak hanya memeriksa apakah halaman muncul.

Yang harus diperiksa:

```text
UI
 |
 v
API
 |
 v
Backend
 |
 v
SID Retail
 |
 v
Accounting
 |
 v
Output
```

Untuk fitur accounting/customer-facing, keberhasilan harus mencakup:

- data benar,
- perhitungan benar,
- output benar,
- transport benar,
- UI menampilkan hasil yang benar.

Contoh penting: PDF yang berhasil dibuat tetapi byte PDF rusak tetap dianggap gagal. Demikian juga UI yang tampil tetapi angka accounting salah tetap dianggap gagal.

---

## 16. Current Project Map

### Stable / Completed in Current Milestone

| Area | Status |
|---|---|
| Frontend GitHub | Stable |
| Development GAS API | Stable |
| SID Retail connection | Tested |
| Dashboard Analytics V1 | Audited / mapped |
| Piutang | Stable |
| Customer Piutang Detail | Stable |
| Tabungan integration | Stable |
| PDF Invoice | Tested |
| PDF Ringkasan Piutang | Tested |
| PDF 6D.1 | Tested |
| PDF 6D.2 | Tested |
| PDF transport | Hardened |
| WhatsApp | Tested |
| UI loading/feedback | Polished |
| Piutang SWR cache | Implemented |

### Next Phase

```text
Pelanggan
    |
    +-- customer master
    +-- customer information
    +-- customer-related views

Data Barang
    |
    +-- product master
    +-- inventory-related views
    +-- product information
```

Detail teknis modul berikutnya belum dianggap final sampai API contract dan implementasinya diuji.

---

## 17. What This Project Is — and Is Not

### Project ini adalah

- frontend application untuk TB Nusantara SID Retail,
- lapisan UI modern yang menggunakan backend Development,
- pengembangan bertahap dengan Git sebagai historical record,
- sistem yang mempertahankan SID Retail sebagai sumber data transaksi.

### Project ini bukan

- pengganti database SID Retail,
- sistem accounting baru,
- tempat eksperimen langsung Production,
- alasan untuk mengubah business logic yang sudah tervalidasi tanpa audit.

---

## 18. Definition of Success

Milestone ini dapat disebut berhasil apabila:

- frontend dapat berkomunikasi dengan Development backend,
- backend dapat berkomunikasi dengan SID Retail,
- data Piutang dapat ditampilkan,
- detail customer dapat ditampilkan,
- PDF dapat dibuat dan ditransport dengan benar,
- accounting summary mengikuti server source of truth,
- WhatsApp menggunakan data transaksi yang benar,
- UX utama berjalan,
- caching mengurangi request berulang,
- Production tetap aman,
- seluruh perubahan dapat ditelusuri melalui Git.

**Milestone 2026-10-02 memenuhi tujuan tersebut berdasarkan pengujian yang telah dilakukan selama pengembangan.**

---

## 19. Baseline Statement

```text
TB NUSANTARA SID RETAIL
PROJECT BASELINE
2026-10-02
```

Baseline ini berarti:

> **Fondasi arsitektur, integrasi backend Development, modul Piutang, PDF, WhatsApp, dan UX yang tercakup dalam milestone ini telah mencapai kondisi stabil dan menjadi dasar untuk pengembangan berikutnya.**

Pengembangan setelah baseline ini harus diperlakukan sebagai **fase baru**, bukan alasan untuk menganggap ulang seluruh fondasi yang telah diuji.

---

## 20. Next Development Principle

Fase berikutnya sebaiknya mengikuti pola:

```text
                    STABLE FOUNDATION
                           |
             +-------------+-------------+
             |                           |
             v                           v
         PELANGGAN                  DATA BARANG
             |                           |
             v                           v
        API Contract                API Contract
             |                           |
             v                           v
        Frontend UI                 Frontend UI
             |                           |
             +-------------+-------------+
                           |
                           v
                         TEST
                           |
                           v
                        REVIEW
                           |
                           v
                       NEW BASELINE
```

Kita tidak perlu membongkar modul stable untuk membangun modul berikutnya kecuali terdapat alasan teknis yang benar-benar terbukti.

---

## 21. Final Project Note

Repository ini bukan sekadar kumpulan source code.

Ia menjadi catatan evolusi sistem TB Nusantara:

```text
Legacy / Existing SID Retail
             |
             v
Development Backend
             |
             v
API Contract
             |
             v
GitHub Frontend
             |
             v
Stable Foundation
             |
             +----> Pelanggan
             |
             +----> Data Barang
             |
             +----> Modul berikutnya
```

**Tujuan utama pengembangan adalah membangun sistem yang dapat berkembang tanpa kehilangan kontrol terhadap data, accounting logic, keamanan, dan sejarah perubahan kode.**

---

## 22. Piutang Aging Bucket Optimization — Catatan / Planned

**Status: CATATAN SAJA — BELUM DIKERJAKAN**

Ada usulan untuk menyederhanakan kolom aging pada halaman **Piutang**.

### Tampilan saat ini

    Pelanggan | Belum Jatuh Tempo | 1–30 | 31–60 | 61–90 | 91–120 | ≥121 | Total Piutang | Aksi

### Usulan tampilan

    Pelanggan | Belum Jatuh Tempo | 1–30 | 31–60 | 61–90 | ≥91 | Total Piutang | Aksi

> Catatan: `≥91` digunakan sebagai interpretasi yang konsisten apabila bucket `91–120` dan `≥121` digabung. Jika pada implementasi final ternyata yang diinginkan adalah `≥100`, bucket `91–99` harus ditentukan secara eksplisit terlebih dahulu.

### Tujuan yang ingin diperiksa

Bukan sekadar mengurangi jumlah kolom UI, tetapi mengetahui apakah penggabungan bucket aging dapat:

- mengurangi pekerjaan perhitungan di backend,
- mengurangi ukuran response API,
- mengurangi request atau query yang diperlukan,
- membuat pengambilan data Piutang lebih ringan,
- atau sebenarnya hanya mengubah tampilan tanpa memberikan keuntungan performa.

### Urutan pekerjaan yang disepakati

**Belum mengubah kode.**

Audit terlebih dahulu pada Google Apps Script (GAS):

1. Periksa endpoint/fungsi API Piutang.
2. Periksa query yang mengambil data Piutang.
3. Tentukan di mana aging bucket dihitung: SID Retail/database, GAS, atau frontend.
4. Periksa apakah setiap bucket saat ini benar-benar memerlukan data/perhitungan terpisah.
5. Hitung jumlah request dan ukuran/struktur response.
6. Baru setelah audit, tentukan apakah penggabungan bucket memberikan keuntungan performa yang nyata.

### Prinsip

    AUDIT GAS
       ↓
    PAHAMI QUERY & API CONTRACT
       ↓
    UKUR BEBAN / REQUEST
       ↓
    PUTUSKAN OPTIMASI
       ↓
    BARU IMPLEMENTASI JIKA TERBUKTI BERMANFAAT

**Untuk saat ini halaman Piutang tidak diubah.** Ini hanya menjadi catatan roadmap/optimasi untuk audit berikutnya.

---

## 23. Customer V1 — Arsitektur Data dan Scope

**Status: DOKUMENTASI ARSITEKTUR / HASIL AUDIT — LOGIC PRODUCTION TIDAK DIUBAH**

Modul Customer V1 menggunakan **master pelanggan** sebagai population utama customer.

Sumber data yang dipakai:

```text
Frontend Customer
       |
       v
GAS API
       |
       +------------------------------+
       |                              |
       v                              v
pelanggan                        penjualan
(master customer)               (transaction piutang)
       |                              |
       +--------------+---------------+
                      |
                      v
              Customer Financial
```

### 23.1 Definisi Customer Aktif Finansial

Customer V1 menganggap pelanggan aktif finansial apabila memenuhi:

```text
saldo_tabungan > 0
OR
saldo_piutang > 0
```

Dengan klasifikasi:

```text
A = Tabungan saja
    saldo_tabungan > 0
    saldo_piutang = 0

B = Piutang saja
    saldo_tabungan = 0
    saldo_piutang > 0

C = Keduanya
    saldo_tabungan > 0
    saldo_piutang > 0

D = Tidak keduanya
    saldo_tabungan = 0
    saldo_piutang = 0
```

Maka:

```text
Customer Aktif Finansial = A + B + C

Customer Memiliki Tabungan = A + C

Customer Memiliki Piutang dari master = B + C
```

Hasil audit pada Development:

```text
Master pelanggan              = 1.730
A — Tabungan saja             =     8
B — Piutang saja              =   216
C — Keduanya                  =    24
D — Tidak keduanya            = 1.482

Aktif Finansial
= 8 + 216 + 24
= 248 pelanggan
```

Tidak terdapat duplicate customer code pada master berdasarkan diagnostic yang dijalankan.

### 23.2 Mengapa Piutang Menampilkan 256 Sedangkan Customer 248?

Perbedaan **248 vs 256 bukan bug Customer V1**.

Laporan Piutang bersifat **transaction-first** dan menghitung unique `penjualan.pelanggan` yang memiliki:

```text
piutang > 0
```

Hasil audit:

```text
Piutang customer yang cocok dengan master
= B + C
= 216 + 24
= 240

Kode piutang yang tidak terdapat di master
= 16

Total unique customer/kode pada laporan Piutang
= 240 + 16
= 256
```

Dengan demikian kedua angka tersebut mempunyai **scope/population yang berbeda**.

```text
CUSTOMER V1
    |
    +-- berangkat dari master pelanggan
    +-- hanya customer master
    +-- aktif finansial = tabungan OR piutang
    +-- hasil audit = 248

PIUTANG
    |
    +-- berangkat dari transaksi penjualan
    +-- transaction-first
    +-- mencakup kode customer yang muncul pada transaksi
    +-- hasil audit = 256
```

### 23.3 Kode Piutang Tanpa Master — Expected Data Scope

Diagnostic menemukan 16 kode yang tidak memiliki pasangan pada `pelanggan.kode`.

Setelah diverifikasi terhadap arsitektur POS Server, kode tersebut bukan alasan untuk mengubah Customer V1.

Ada dua kelompok:

#### A. Transaksi sementara / held transaction

Kode dengan prefix:

```text
____2207004
____2510022
____2609029
```

Kode tersebut merupakan transaksi yang **masih ditahan sementara di backend POS Server**, antara lain untuk memungkinkan tambahan barang dimasukkan sebelum transaksi diselesaikan.

Kode tersebut **tidak diperlakukan sebagai customer master** pada Customer V1.

#### B. Data cabang

Kode berikut berasal dari data cabang yang memang mempunyai piutang:

```text
AJI
BJAYA
FBR
HENDRA
ITHENG
KUKUH
KURNIA
MIRYA
RHD
RIMBAL
SUMA
TB BEJA
WENDY
```

Data tersebut valid dalam scope laporan transaksi Piutang karena transaksi dan piutangnya memang terdapat pada POS Server.

**Kesimpulan:** keberadaan kode tersebut pada laporan Piutang tidak berarti master customer utama harus diubah untuk memasukkan semuanya.

### 23.4 Contract Antar-Modul

Jangan menyamakan population Customer dan Piutang secara otomatis.

```text
Customer V1
    = master pelanggan
    + saldo tabungan master
    + saldo piutang transaction-first yang
      dapat direkonsiliasi dengan customer master

Piutang
    = transaksi penjualan outstanding
    + seluruh customer/kode transaksi yang
      berada dalam scope laporan Piutang
```

Karena itu:

```text
Customer Aktif Finansial = 248
Piutang Customer/Kode     = 256
```

**keduanya dapat benar secara bersamaan.**

Perbedaan jumlah tidak boleh dianggap sebagai bug hanya karena angka Piutang lebih besar. Yang harus diperiksa terlebih dahulu adalah **scope dan sumber population** masing-masing laporan.

### 23.5 Prinsip Data Quality

Diagnostic overlap dipertahankan sebagai alat audit read-only.

Jika pada masa depan muncul kembali perbedaan angka Customer dan Piutang, langkah pertama adalah:

```text
1. Identifikasi population masing-masing endpoint
2. Bandingkan source table
3. Identifikasi customer/kode yang tidak overlap
4. Bedakan:
      - master customer
      - data cabang
      - transaksi sementara
      - data legacy
      - anomaly nyata
5. Baru tentukan apakah perlu perubahan kode
```

**Jangan memperbaiki anomaly data dengan mengubah business logic sebelum struktur data sumber dipahami.**

### 23.6 Customer V1 — Backend Contract Saat Ini

Endpoint Customer V1 utama:

```text
pelanggan
    -> getPelangganAktifFinansialSemuaV1()

pelangganDetail
    -> getPelangganDetailV1(kode_pelanggan)

pelangganTabunganHistory
    -> getRiwayatTabunganPelangganV1(kode_pelanggan, limit)
```

Customer list menggunakan **full dataset load** dan pagination dilakukan di frontend.

Customer list tidak menggunakan cursor pagination production sebagai mekanisme utama.

Detail customer mengambil posisi finansial customer dan riwayat tabungan secara terpisah.

### 23.7 Customer Cache Contract

Customer list menggunakan cache frontend:

```text
sessionStorage
key:
sidretail:customer:v1

TTL:
2 menit
```

Perilaku:

```text
Cache fresh
    -> tampilkan langsung
    -> tidak perlu request backend

Cache stale
    -> tampilkan cache lama
    -> refresh backend di background

Tidak ada cache
    -> request backend

Manual Refresh
    -> paksa request backend
```

Detail customer dan history **tidak dianggap sama dengan cache customer list** dan tetap mengambil data sesuai kebutuhan detail.

Cache hanya optimasi UX. Source of truth tetap berada di backend/SID Retail.

### 23.8 Prinsip Arsitektur Customer

```text
                    SID RETAIL
                        |
             +----------+----------+
             |                     |
             v                     v
         pelanggan             penjualan
         master                 transaksi
             |                     |
             |                     |
             +----------+----------+
                        |
                        v
                  GAS Backend
                        |
                  Customer API
                        |
                        v
                 GitHub Frontend
                        |
             +----------+----------+
             |                     |
             v                     v
        Customer List          Customer Detail
             |                     |
         local search          posisi finansial
         pagination            + history tabungan
         2m cache
```

Prinsip yang harus dipertahankan:

1. **SID Retail tetap source of truth.**
2. **Customer V1 menggunakan master customer sebagai population utama.**
3. **Piutang menggunakan transaction-first population.**
4. Data cabang dan transaksi sementara tidak boleh dipaksa menjadi customer master tanpa kebutuhan bisnis yang terbukti.
5. Cache frontend bukan source of truth.
6. Data anomaly harus diaudit berdasarkan source dan scope sebelum business logic diubah.
7. Perubahan Customer V1 tetap melalui Development → test → review → baseline baru.
8. Production/stable tidak menjadi tempat eksperimen.

---

## 24. Customer V1 — Audit Status

Hasil audit Customer V1 yang sudah dilakukan:

| Item | Status |
|---|---|
| Customer active financial formula | Valid |
| A/B/C/D classification | Valid |
| Master duplicate customer code | 0 ditemukan |
| Piutang master overlap | 240 |
| Piutang transaction-first population | 256 |
| Orphan/extended transaction codes | Explained by data architecture |
| 248 vs 256 | **RESOLVED / EXPECTED BEHAVIOR** |
| Production business logic change | **Tidak diperlukan** |
| Customer cache | Implemented, browser validation tetap diperlukan |

Kesimpulan audit:

> **248 pada Customer V1 dan 256 pada Piutang bukan dua angka yang harus dipaksa menjadi sama. Keduanya merepresentasikan population yang berbeda dan keduanya valid berdasarkan arsitektur data yang telah diverifikasi.**

---

## 25. Baseline / Development Discipline

Setelah arsitektur dan contract suatu modul dipahami, pengembangan berikutnya harus mengikuti:

```text
AUDIT
  |
  v
UNDERSTAND DATA SCOPE
  |
  v
DEFINE API CONTRACT
  |
  v
IMPLEMENT
  |
  v
TEST DEVELOPMENT
  |
  v
REVIEW
  |
  v
NEW BASELINE
```

Untuk Customer V1, hasil audit data scope di atas menjadi referensi sebelum dilakukan perubahan berikutnya terhadap Customer, Piutang, PDF customer, WhatsApp customer, atau modul yang menggunakan data pelanggan.

---

## 26. Final Project Note

Repository ini bukan sekadar kumpulan source code.

Ia menjadi catatan evolusi sistem TB Nusantara:

```text
Legacy / Existing SID Retail
             |
             v
Development Backend
             |
             v
API Contract
             |
             v
GitHub Frontend
             |
             v
Stable Foundation
             |
             +----> Pelanggan
             |
             +----> Data Barang
             |
             +----> Modul berikutnya
```

**Tujuan utama pengembangan adalah membangun sistem yang dapat berkembang tanpa kehilangan kontrol terhadap data, accounting logic, keamanan, dan sejarah perubahan kode.**

---


---

## 12. Baseline 2026-10-05 — GAS Production Cleanup

**Baseline:** `stable/2026-10-05`  
**Source:** `cleanup/gas-production-2026-10-05`  
**Tested source commit:** `c9e72a8faa788b58ed9df113c7371ded4937e330`

Baseline ini dikunci setelah seluruh smoke test Development dinyatakan **PASS**.

### Smoke Test Final

| Area | Hasil |
|---|---|
| Dashboard — data omzet | PASS |
| Dashboard — laba bulanan | PASS |
| Dashboard — summary | PASS |
| Customer — refresh/cache | PASS |
| Tabungan — saldo | PASS |
| Tabungan — riwayat | PASS |
| PDF customer dengan customer lain | PASS |
| PDF customer tanpa riwayat tabungan | PASS |
| Customer hanya tabungan | PASS |
| Customer hanya piutang | PASS |
| API `health` | PASS |
| API `validateConfig` | PASS |
| FIKA customer `2606030` — detail, riwayat, PDF | PASS |

### GAS Production Structure

Folder `code/` pada baseline ini dipertahankan sebagai source production yang telah diaudit:

```text
code/
├── Code.gs
├── Customer_API_V1.gs
├── Dashboard_Analytics_V1.gs
└── Production_Tabungan_V1.gs
```

File diagnostic/test obsolete yang dihapus dari source production:

- `Diagnostic_Customer_Financial_Overlap_V1.gs`
- `Diagnostic_Fika_Tabungan.gs`
- `Invoice_WhatsApp_V2.gs`

`vik.gs` juga tidak termasuk source production baseline apabila masih terdapat pada project GAS Development.

### Production Functions Preserved

Cleanup dilakukan dengan prinsip **tidak mengubah atau menghapus fungsi production yang masih menjadi dependency**.

Dependency Stage 6 yang sempat teridentifikasi dan dipulihkan:

- `validateStage6CustomerCode_`
- `validateStage6TransactionCode_`
- `getRingkasanPiutangPelanggan`
- `stage6AgeLabel_`
- `inspectPdfBytes_`
- `apiV1Pdf6D2WithFingerprint_`
- `apiV1Sha256Hex_`

Syntax production `getSemuaNotaOutstanding()` juga dipulihkan ke deklarasi fungsi yang benar.

### Customer V1

Customer V1 menggunakan pendekatan master-customer oriented untuk daftar customer aktif secara finansial.

Kontrak penting:

- saldo tabungan berasal dari `pelanggan.saldo_tabungan`
- saldo piutang berasal dari transaksi `penjualan.piutang`
- riwayat tabungan berasal dari tabel `tabungan`
- Customer V1 tidak memaksa seluruh kode transaksi piutang yang tidak terdapat pada master customer masuk ke daftar customer master

Kondisi customer yang telah diuji mencakup:

- hanya tabungan
- hanya piutang
- tabungan dan piutang
- tanpa riwayat tabungan
- PDF customer

### Recovery Point

Baseline sebelumnya **tetap dipertahankan dan tidak diubah**:

```text
stable/2026-10-04
29664e947f39dba74f83df18e7b784a455db06a2
```

Baseline baru:

```text
stable/2026-10-05
```

Aturan pengembangan berikutnya:

```text
stable/2026-10-05
       |
       +---- baseline / recovery point
       |
       +---- feature branch
       |
       +---- development GAS
       |
       +---- smoke test
       |
       +---- review
       |
       +---- baseline berikutnya
```

**Baseline ini tidak boleh diperlakukan sebagai tempat eksperimen langsung.** Perubahan berikutnya harus dimulai dari branch development/feature baru dan melewati pengujian sebelum menjadi baseline berikutnya.

### Cleanup Documentation

Audit dan keputusan cleanup lengkap dicatat pada:

`docs/GAS_CLEANUP_2026-10-05.md`

Status akhir:

**CLEANUP + SMOKE TEST: PASS — BASELINE 2026-10-05 READY**

---

## 27. Git Branch & Deployment Discipline

Mulai 2026-10-05, repository menggunakan aturan branch berikut sebagai **aturan kerja resmi**.

### Peran Branch

```text
main
 |
 +-- Source code aktif untuk admin.tbnusantara.com
 |
 +-- Versi utama yang sedang digunakan / dikembangkan
 |
 +-- Bukan tempat eksperimen sembarangan
 |
 +-- Perubahan masuk setelah melalui development, testing, dan review


stable/2026-10-05
 |
 +-- Baseline resmi
 |
 +-- Recovery point
 |
 +-- Tidak digunakan sebagai tempat eksperimen
 |
 +-- Tidak diubah setelah dikunci


stable/2026-10-04
 |
 +-- Recovery point lama
 |
 +-- Dipertahankan untuk historical recovery
```

### Branch Utama

**`main` adalah source utama untuk `admin.tbnusantara.com`.**

Commit yang berada pada `main` merepresentasikan versi aplikasi yang sedang dijadikan acuan utama untuk deployment/admin frontend.

Baseline resmi saat aturan ini ditetapkan:

```text
main
    = 94c5257c243e6ba54959c799ad7261f48091b2f6

stable/2026-10-05
    = 94c5257c243e6ba54959c799ad7261f48091b2f6
```

Kedua branch tersebut sengaja berada pada commit yang sama pada saat baseline 2026-10-05 ditetapkan.

### Aturan Pengembangan Fitur

Fitur baru **tidak dikerjakan langsung pada `main`** apabila masih bersifat eksperimen atau belum tervalidasi.

Alur standar:

```text
                  main
                   |
                   v
          feature/<nama-fitur>
                   |
                   v
          Development GAS
                   |
                   v
              Testing
                   |
                   v
               Review
                   |
                   v
              main
                   |
                   v
          Stable / Release
```

Contoh:

```text
main
 |
 +-- feature/customer-v2
 |
 +-- feature/dashboard-v2
 |
 +-- fix/pdf-transport-v3
```

Branch feature/fix digunakan untuk pekerjaan yang sedang dikembangkan. Setelah selesai dan terbukti aman, perubahan dapat diintegrasikan ke `main`.

### Aturan Baseline

Setelah `main` mencapai kondisi yang dianggap stabil dan telah melewati pengujian yang diperlukan, buat baseline baru:

```text
stable/YYYY-MM-DD
```

Contoh:

```text
stable/2026-10-05
stable/2026-10-15
stable/2026-11-01
```

Baseline adalah **checkpoint yang dapat digunakan untuk recovery**.

Baseline yang sudah dikunci tidak boleh diperlakukan sebagai branch eksperimen.

### Prinsip Recovery

Jika perubahan pada `main` menyebabkan masalah:

```text
main
 |
 X  masalah
 |
 v
stable/<baseline-terakhir>
 |
 v
recovery / rollback / diagnosis
```

Tujuannya agar pengembangan tidak menghilangkan versi terakhir yang sudah terbukti stabil.

### Aturan Penting

1. **`main` = source utama `admin.tbnusantara.com`.**
2. **`stable/*` = baseline/recovery, bukan tempat eksperimen.**
3. Fitur baru dibuat pada branch `feature/*` dari `main`.
4. Bug fix terisolasi dapat menggunakan branch `fix/*`.
5. Pengembangan backend tetap dilakukan dan diuji pada **Development GAS** sebelum dianggap siap.
6. Perubahan yang menyentuh accounting logic, API contract, PDF, atau business logic harus melalui testing dan review.
7. Jangan mengubah baseline lama hanya untuk mengikuti perkembangan fitur baru.
8. Setelah versi stabil baru tercapai, buat baseline baru.
9. Setiap perubahan harus dapat ditelusuri melalui commit Git.
10. Jika ada keraguan terhadap kondisi repository, **baseline terakhir yang sudah teruji menjadi titik referensi**, bukan asumsi dari percakapan lama.

### Tujuan Aturan Ini

README ini sengaja mencatat branch discipline agar konteks proyek tetap dapat dipahami walaupun pengembangan dilanjutkan pada percakapan ChatGPT yang berbeda.

Dengan demikian, percakapan baru tidak perlu menebak:

- branch mana yang aktif,
- branch mana yang menjadi baseline,
- branch mana yang boleh diubah,
- branch mana yang digunakan oleh `admin.tbnusantara.com`,
- atau dari mana pengembangan fitur baru harus dimulai.

**Rule of thumb:**

```text
ADMIN AKTIF
    -> main

BASELINE / RECOVERY
    -> stable/YYYY-MM-DD

FITUR BARU
    -> feature/<nama>

BUG FIX TERISOLASI
    -> fix/<nama>

SEBELUM MASUK main
    -> Development -> Test -> Review

SETELAH STABIL
    -> New Baseline
```


---

## UI/UX Polish V3 — Audit & Architecture Direction

**Branch:** `ui/ux-polish-v3`  
**Baseline:** `855992dd340720695a7abb164d06fa77110b2488`  
**Audit status:** COMPLETED — IMPLEMENTATION NOT STARTED

V3 is an incremental UI/UX and architecture refinement, **not a redesign from zero**.

### Objectives

- professional and consistent visual language,
- cleaner and more comfortable UX,
- compact executive-style Dashboard,
- clearer frontend module ownership,
- maintainable code structure,
- changes that remain understandable for future updates and feature development.

### Current architectural direction

```
index.html
   |
   v
assets/js/app.js
   |
   +-- api/
   |    +-- client.js
   |    +-- endpoints.js
   |
   +-- pages/
   |    +-- dashboard.js
   |    +-- pelanggan.js
   |    +-- piutang.js
   |
   +-- ui-polish.js
   |
   +-- components/
        (reserved for genuinely reusable UI components)
```

Current audit found that the foundation is good, but `dashboard.js` carries too many responsibilities: state, cache, normalization, shell rendering, calendar, charts, interaction and orchestration.

The agreed approach is **incremental extraction**, not a large rewrite.

### Dashboard V3 priorities

1. Omzet Penjualan
2. Laba Bulanan
3. Piutang Berjalan
4. Transaksi
5. Omzet Harian
6. Laba Harian
7. Kalender operasional
8. Source of truth

The main visual issue identified is excessive vertical space in some Dashboard chart compositions, especially around Omzet Harian. V3 will reduce this without changing the underlying data contract.

### CSS ownership direction

- `app.css` → application foundation, global layout and primitives.
- `ui-polish.css` → visual refinement layer.
- Future page-specific styling should have clear ownership.
- Avoid uncontrolled accumulation of unrelated CSS fixes.

### Business safety boundary

V3 must not silently alter:

- accounting logic,
- Piutang aging,
- Collection Priority,
- API contracts,
- SID Retail source-of-truth definitions,
- production GAS behavior,
- Piutang locked scope.

### Documentation rule

Meaningful V3 changes are recorded through:

1. Git commit history,
2. README for architecture, behavior, baseline and development rules,
3. `docs/` for detailed technical audits and decisions.

Detailed audit:

`docs/UI_UX_POLISH_V3_AUDIT.md`

### V3 workflow

```
AUDIT
  ↓
DESIGN
  ↓
IMPLEMENT
  ↓
VISUAL / FUNCTIONAL TEST
  ↓
REVIEW
  ↓
DOCUMENT
  ↓
COMMIT / PR
  ↓
MAIN
  ↓
NEW BASELINE
```

**Current decision:** no production/business logic was changed by the audit. The first implementation target is Dashboard composition, followed by responsive refinement, cross-page consistency, selective architecture cleanup, QA, and documentation.
