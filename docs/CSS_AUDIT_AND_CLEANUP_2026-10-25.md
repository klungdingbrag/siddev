# Audit & Perapihan CSS — 2026-10-25

**Branch:** `ui/ux-polish-v3`  
**Audit base:** `16c7915548a72d8c893594b02977a6218f9d311d`  
**Scope:** `app.css`, `ui-polish.css`, `invoice.css`, `calculator.css`, dan urutan pemuatan pada `index.html`.

## Urutan dan tanggung jawab file

Stylesheet dimuat dengan urutan berikut:

1. `assets/css/app.css` — fondasi shell, komponen umum, layout Dashboard, tabel, modal, dan breakpoint dasar.
2. `assets/css/ui-polish.css` — lapisan penyempurnaan visual serta beberapa override untuk shell, komponen umum, dashboard, modal, dan responsivitas.
3. `assets/css/invoice.css` — layout Invoice, pratinjau, dan aturan cetak/PDF Invoice.
4. `assets/css/calculator.css` — tampilan khusus Kalkulator.

Karena `ui-polish.css` dimuat setelah `app.css`, aturan dengan selector yang sama dapat menjadi override yang disengaja. Kesamaan selector saja tidak cukup untuk menghapus aturan.

## Temuan selector yang bertumpang tindih

Pemeriksaan mencatat 92 selector yang muncul pada kedua file utama. Mayoritas memiliki deklarasi berbeda dan dipertahankan sebagai lapisan override, antara lain `.sidebar`, `.nav-item`, `.page-content`, `.btn`, `.modal-panel`, dan komponen Dashboard.

Contoh: `.sidebar` memakai ukuran/layout dasar dari `app.css`, sementara `ui-polish.css` mengganti warna, border, dan bayangan. Aturan-aturan ini bukan duplikat.

## Duplikat identik yang dibersihkan

Tujuh deklarasi duplikat dengan selector dan konteks media yang sama dibersihkan. Aturan yang muncul lebih akhir tetap dipertahankan:

| Selector | File/aturan yang dihapus | Aturan yang dipertahankan |
| --- | --- | --- |
| `.table-state.error` | `app.css` global | `ui-polish.css` global |
| `.detail-table-scroll` | Kemunculan awal di `app.css` global | Kemunculan berikutnya di `app.css` |
| `.detail-customer` | Kemunculan awal di `app.css`, max-width 800px | Kemunculan berikutnya di `app.css`, konteks sama |
| `.dashboard-kpis` | `app.css`, max-width 1100px | `ui-polish.css`, konteks sama |
| `.mobile-menu-toggle:active` | `app.css`, max-width 1100px | `ui-polish.css`, konteks sama |
| `.dashboard-chart` | `app.css`, max-width 520px | `ui-polish.css`, konteks sama |
| `button` tap highlight | Kemunculan awal di `ui-polish.css` | Selector gabungan yang lebih akhir di file yang sama |

Aturan yang dipertahankan memiliki deklarasi yang sama, sehingga pembersihan ini tidak mengubah nilai akhir cascade untuk selector dan kondisi terkait.

## File khusus yang sengaja tidak digabung

`invoice.css` dan `calculator.css` tetap terpisah. Aturan cetak Invoice/PDF dan aturan Kalkulator tidak dipindahkan atau ditulis ulang. Duplikat kecil yang terkait blok signature/print Invoice dicatat untuk tinjauan terpisah, tetapi tidak disentuh pada tahap ini demi menjaga hasil cetak.

## Pemeriksaan setelah perubahan

Pembersihan hanya menghapus deklarasi identik dan tidak mengubah nilai visual. Untuk validasi browser pada rilis ini, tinjau:

- [ ] Desktop: shell, Dashboard, toolbar, tabel, dan kartu.
- [ ] Tablet: navigasi, pencarian, grid ringkasan, tabel/kartu.
- [ ] Modal: detail Pelanggan/Piutang dan scroll.
- [ ] Cetak: Invoice/PDF dan Surat Jalan.

Status pemeriksaan ini adalah **source-level review selesai; visual browser/print review perlu dilakukan pada situs setelah perubahan tampil**. Jangan menganggap keberhasilan source review sebagai bukti bahwa deployment sudah diperbarui.
