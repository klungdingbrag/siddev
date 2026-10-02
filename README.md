# TB NUSANTARA — SID Retail Development

> **Project:** TB Nusantara SID Retail  
> **Repository:** `klungdingbrag/siddev`  
> **Current milestone:** Frontend V1 + Development Backend Integration  
> **Stable baseline:** `stable/2026-10-02`  
> **Current UI/UX development branch:** `ui/ux-polish-v1`  
> **Status:** Stable foundation / Development continues

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
| Dashboard foundation | Stable |
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
