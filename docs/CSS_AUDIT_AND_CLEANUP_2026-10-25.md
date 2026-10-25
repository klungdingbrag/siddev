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

Pemeriksaan mencatat 123 selector yang muncul pada kedua file utama. Mayoritas memiliki deklarasi berbeda dan dipertahankan sebagai lapisan override, antara lain `.sidebar`, `.nav-item`, `.page-content`, `.btn`, `.modal-panel`, dan komponen Dashboard.

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


## Peta lengkap selector bersama (snapshot sebelum cleanup)

Tabel berikut mencatat seluruh selector yang muncul di kedua stylesheet utama. Kolom deklarasi merangkum properti per konteks global/media. Label override menunjukkan ada properti bernama sama pada konteks yang sama; nilainya dapat berbeda, sehingga aturan dipertahankan. Label aditif/konteks berbeda berarti aturan melengkapi selector atau berlaku pada breakpoint yang berbeda. Tabel ini adalah peta source; bukan instruksi untuk menghapus selector.

Jumlah selector bersama: **123**.

| Selector | `app.css` — properti per konteks | `ui-polish.css` — properti per konteks | Klasifikasi |
| --- | --- | --- | --- |
| `:root` | (global): --bg, --surface, --surface-soft, --border, --text, --muted, --accent, --accent-soft, --success, --sidebar, --sidebar-muted, --radius, --shadow | (global): --ui-primary, --ui-primary-dark, --ui-success, --ui-success-dark, --ui-danger, --ui-warning, --ui-focus, --ui-shadow-soft, --ui-shadow-action<br>(global): --ui-surface-raised, --ui-surface-subtle, --ui-border-soft, --ui-border-strong, --ui-text-strong, --ui-text-body, --ui-text-muted, --ui-primary-soft, --ui-success-soft, --ui-danger-soft, --ui-warning-soft, --ui-radius-sm, --ui-radius-md, --ui-radius-lg, --ui-shadow-card, --ui-shadow-card-hover | Additif / konteks berbeda |
| `.aging-card` | (global): border, border-left, border-radius, padding, background | (global): border-color<br>(global): box-shadow | Additif / konteks berbeda |
| `.aging-danger` | (global): border-left-color, background | (global): background | Override properti (dipertahankan) |
| `.api-reconnect` | (global): margin-left, border, border-radius, padding, background, color, cursor, font-size, font-weight, white-space | (global): border-color, background, color | Override properti (dipertahankan) |
| `.api-reconnect:hover` | (global): background, color | (global): border-color, background, color | Override properti (dipertahankan) |
| `.app-footer` | (global): margin-top | (global): width, display, align-items, justify-content, gap, margin-top, padding, color, font-size, line-height, letter-spacing, text-align<br>@media (max-width: 520px): padding, font-size, gap | Properti sama; cek blok identik |
| `.app-toast` | (global): position, right, bottom, z-index, max-width, background, color, border-radius, padding, box-shadow, font-size, opacity, transform, pointer-events, transition | (global): display, align-items, min-height, padding, border, border-radius, box-shadow<br>@media (prefers-reduced-motion: reduce): transition<br>(global): border-radius, font-weight | Override properti (dipertahankan) |
| `.brand` | (global): display, gap, align-items, padding<br>@media (max-width: 1100px): padding, justify-content | (global): padding | Override properti (dipertahankan) |
| `.brand span` | (global): display<br>(global): color, font-size, margin-top | (global): font-size<br>(global): color | Override properti (dipertahankan) |
| `.brand strong` | (global): display<br>@media (max-width: 1100px): font-size | (global): font-size, letter-spacing<br>(global): color | Additif / konteks berbeda |
| `.brand-mark` | (global): width, height, border-radius, display, place-items, background, font-weight | (global): width, height, border-radius, box-shadow<br>(global): box-shadow | Override properti (dipertahankan) |
| `.btn` | (global): border, border-radius, padding, cursor, background, color, font-weight | (global): transition<br>(global): min-height, padding, border-radius, box-shadow<br>@media (max-width: 520px): min-height<br>@media (prefers-reduced-motion: reduce): transition<br>(global): font-weight<br>(global): border-radius, min-height<br>@media (max-width: 520px): border-radius | Override properti (dipertahankan) |
| `.btn-primary` | (global): background, color, border-color | (global): background, border-color, box-shadow<br>(global): box-shadow | Override properti (dipertahankan) |
| `.btn-whatsapp` | (global): border-color, background, color | (global): box-shadow<br>(global): background | Properti sama; cek blok identik |
| `.card.panel` | (global): background, border, border-radius, box-shadow, overflow<br>@media (max-width: 1100px): min-width | (global): border-color, box-shadow<br>(global): border-radius | Override properti (dipertahankan) |
| `.contact-input` | (global): width, border, border-radius, padding, outline, background | (global): border-color, border-radius | Override properti (dipertahankan) |
| `.contact-input:focus` | (global): border-color, background | (global): border-color, box-shadow | Override properti (dipertahankan) |
| `.contact-message` | (global): width, border, border-radius, padding, outline, background<br>(global): resize, min-height, line-height | (global): border-color, border-radius | Override properti (dipertahankan) |
| `.contact-message:focus` | (global): border-color, background | (global): border-color, box-shadow | Override properti (dipertahankan) |
| `.customer-cell` | (global): display, gap, min-width | @media (min-width: 1101px): min-width, overflow | Additif / konteks berbeda |
| `.customer-cell span` | (global): color, font-size | (global): color<br>@media (min-width: 1101px): overflow, text-overflow, white-space | Override properti (dipertahankan) |
| `.dashboard-chart` | (global): width, height<br>@media (max-width: 800px): height<br>@media (max-width: 1100px): min-width<br>@media (max-width: 520px): height | @media (max-width: 1100px): min-width, max-width<br>@media (max-width: 520px): height | Properti sama; cek blok identik |
| `.dashboard-chart svg` | (global): display, width, height, overflow | @media (max-width: 1100px): width, max-width | Additif / konteks berbeda |
| `.dashboard-chart-grid` | (global): display, grid-template-columns, grid-template-areas, gap, align-items<br>@media (max-width: 1100px): grid-template-columns, grid-template-areas | @media (max-width: 800px): gap<br>@media (max-width: 1100px): min-width, max-width<br>@media (max-width: 1100px): grid-template-columns | Override properti (dipertahankan) |
| `.dashboard-chart-stage` | (global): position, width, height | @media (max-width: 1100px): width, max-width | Additif / konteks berbeda |
| `.dashboard-chart-wide` | (global): grid-row | @media (max-width: 1100px): grid-row | Additif / konteks berbeda |
| `.dashboard-chart-wrap` | (global): min-height, padding<br>@media (max-width: 800px): min-height<br>@media (max-width: 1100px): min-width<br>@media (max-width: 1100px): overflow<br>@media (max-width: 520px): padding | (global): background<br>@media (max-width: 1100px): min-width, max-width<br>@media (max-width: 520px): min-height, padding-left, padding-right, overflow | Properti sama; cek blok identik |
| `.dashboard-chart-wrap-profit` | (global): min-height<br>@media (max-width: 800px): min-height<br>@media (max-width: 520px): padding | @media (max-width: 520px): min-height, padding-left, padding-right, overflow | Additif / konteks berbeda |
| `.dashboard-definition-list` | (global): padding | (global): background<br>@media (max-width: 1100px): min-width, max-width | Additif / konteks berbeda |
| `.dashboard-definition-list div` | (global): display, justify-content, gap, padding, border-bottom<br>@media (max-width: 520px): display, gap | (global): padding | Override properti (dipertahankan) |
| `.dashboard-definition-list strong` | (global): font-size, text-align<br>@media (max-width: 520px): text-align | (global): color | Additif / konteks berbeda |
| `.dashboard-heading` | (global): align-items<br>@media (max-width: 800px): align-items | @media (max-width: 1100px): min-width, max-width | Additif / konteks berbeda |
| `.dashboard-kpi` | (global): min-width, display, gap, align-items, padding, background, border, border-radius, box-shadow<br>@media (max-width: 1100px): min-width | (global): border-color, box-shadow<br>@media (prefers-reduced-motion: reduce): transition<br>(global): position, overflow, padding<br>@media (max-width: 800px): padding<br>@media (max-width: 520px): gap | Override properti (dipertahankan) |
| `.dashboard-kpi small` | (global): display, color<br>(global): font-size, white-space, overflow, text-overflow | @media (max-width: 520px): font-size | Additif / konteks berbeda |
| `.dashboard-kpi strong` | (global): display, margin, font-size, letter-spacing, white-space<br>@media (max-width: 520px): font-size | @media (max-width: 520px): font-size | Override properti (dipertahankan) |
| `.dashboard-kpi-icon` | (global): width, height, flex, display, place-items, border-radius, background, color, font-size, font-weight | (global): box-shadow<br>@media (max-width: 800px): width, height, flex-basis | Additif / konteks berbeda |
| `.dashboard-kpi-primary` | (global): border-top | (global): border-top-width | Additif / konteks berbeda |
| `.dashboard-kpi-profit` | (global): border-top | (global): border-top-width | Additif / konteks berbeda |
| `.dashboard-kpis` | (global): display, grid-template-columns, gap, margin-bottom<br>@media (max-width: 1100px): grid-template-columns<br>@media (max-width: 800px): grid-template-columns<br>@media (max-width: 520px): grid-template-columns | @media (max-width: 1100px): min-width, max-width<br>@media (max-width: 1100px): grid-template-columns<br>@media (max-width: 520px): grid-template-columns | Override properti (dipertahankan) |
| `.dashboard-panel` | (global): min-width, background, border, border-radius, box-shadow, overflow<br>@media (max-width: 1100px): min-width | (global): border-color, box-shadow<br>@media (max-width: 1100px): min-width, max-width | Override properti (dipertahankan) |
| `.dashboard-panel-head` | (global): min-height, display, justify-content, align-items, gap, padding, border-bottom<br>@media (max-width: 520px): min-height, align-items<br>@media (max-width: 520px): padding | (global): min-height, padding<br>@media (max-width: 800px): min-height<br>@media (max-width: 1100px): min-width<br>@media (max-width: 520px): gap, padding | Override properti (dipertahankan) |
| `.dashboard-panel-head h3` | (global): margin, font-size | (global): color, letter-spacing<br>@media (max-width: 520px): font-size | Additif / konteks berbeda |
| `.dashboard-panel-value` | (global): color, font-weight, font-size, white-space<br>@media (max-width: 520px): font-size | (global): color<br>@media (max-width: 1100px): max-width, overflow, text-overflow<br>@media (max-width: 520px): max-width, font-size | Override properti (dipertahankan) |
| `.dashboard-period select` | (global): min-width, min-height, padding, border, border-radius, background, color, outline<br>@media (max-width: 800px): width, min-width | (global): border-color, border-radius | Override properti (dipertahankan) |
| `.dashboard-period select:focus` | (global): border-color, box-shadow | (global): border-color, box-shadow | Override properti (dipertahankan) |
| `.dashboard-profit-tooltip` | (global): border-color, box-shadow | (global): position, z-index, width, max-width, padding, border, border-radius, background, box-shadow, color, pointer-events, opacity, visibility, transform, transition<br>@media (prefers-reduced-motion: reduce): transition | Override properti (dipertahankan) |
| `.dashboard-profit-tooltip strong` | (global): color | (global): display<br>(global): font-size, font-weight, line-height | Additif / konteks berbeda |
| `.dashboard-state.is-error` | (global): min-height, padding, border, border-radius, background<br>(global): color, flex-direction, line-height | (global): border-color | Additif / konteks berbeda |
| `.dashboard-state.is-loading` | (global): min-height, padding, border, border-radius, background | (global): border-color | Additif / konteks berbeda |
| `.dashboard-toolbar` | (global): display, align-items, gap, flex-wrap<br>@media (max-width: 800px): display, grid-template-columns, align-items<br>@media (max-width: 520px): grid-template-columns | @media (max-width: 1100px): min-width, max-width<br>@media (max-width: 520px): width, max-width | Additif / konteks berbeda |
| `.data-table td` | (global): padding, border-bottom, text-align, white-space, font-size | (global): color<br>@media (max-width: 800px): padding-left, padding-right | Additif / konteks berbeda |
| `.data-table th` | (global): padding, border-bottom, text-align, white-space, font-size<br>(global): background, color, font-size, text-transform, letter-spacing | (global): background, color, font-weight<br>@media (max-width: 800px): padding-left, padding-right | Override properti (dipertahankan) |
| `.data-table tr:hover td` | (global): background | (global): background | Override properti (dipertahankan) |
| `.detail-customer div` | (global): border, border-radius, padding<br>(global): border, border-radius, padding, background | (global): border-color<br>(global): background | Override properti (dipertahankan) |
| `.detail-error` | (global): padding, text-align, color<br>(global): display, gap, color | (global): margin, padding, border, border-radius, background<br>(global): border-color, background | Override properti (dipertahankan) |
| `.detail-footer` | (global): flex, display, justify-content, align-items, gap, padding, border-top, background, position, bottom, z-index<br>@media (max-width: 800px): flex-direction, align-items | (global): padding, box-shadow<br>(global): background, border-top-color | Override properti (dipertahankan) |
| `.detail-footer-left` | (global): display, align-items, gap<br>@media (max-width: 800px): width<br>@media (max-width: 520px): flex-direction | (global): gap<br>@media (max-width: 800px): gap | Override properti (dipertahankan) |
| `.detail-footer-left .btn` | @media (max-width: 800px): flex<br>@media (max-width: 520px): width | (global): white-space<br>@media (max-width: 800px): min-height | Additif / konteks berbeda |
| `.detail-footer-right` | (global): display, align-items, gap<br>@media (max-width: 800px): width<br>@media (max-width: 520px): flex-direction | (global): gap<br>@media (max-width: 800px): gap | Override properti (dipertahankan) |
| `.detail-footer-right .btn` | @media (max-width: 800px): flex<br>@media (max-width: 520px): width | (global): white-space<br>@media (max-width: 800px): min-height | Additif / konteks berbeda |
| `.detail-heading` | (global): font-weight, margin | (global): display, align-items, gap | Additif / konteks berbeda |
| `.detail-loading` | (global): padding, text-align, color | (global): min-height, display, flex-direction, align-items, justify-content, gap, line-height<br>(global): background | Additif / konteks berbeda |
| `.detail-table th` | (global): padding, border-bottom, text-align, font-size, white-space<br>(global): color, font-size, text-transform<br>(global): background, color, font-size, text-transform, letter-spacing | (global): background, color | Override properti (dipertahankan) |
| `.environment-badge` | (global): border, background, padding, border-radius, font-size, color<br>@media (max-width: 1100px): flex, padding, font-size<br>@media (max-width: 520px): max-width, overflow, text-overflow, white-space | (global): padding, border-color, background, color, font-weight | Override properti (dipertahankan) |
| `.eyebrow` | (global): margin, text-transform, letter-spacing, font-size, font-weight, color | (global): color, font-size, letter-spacing | Override properti (dipertahankan) |
| `.financial-card` | (global): border-radius, border, padding, display, justify-content, align-items, gap | (global): border-color | Additif / konteks berbeda |
| `.financial-card.debt` | (global): background, border-color, color | (global): background, border-color, box-shadow | Override properti (dipertahankan) |
| `.icon-btn` | (global): border, background, border-radius, padding, cursor, font-size, font-weight | (global): transition<br>@media (prefers-reduced-motion: reduce): transition<br>(global): font-weight<br>@media (min-width: 1101px): padding, font-size | Override properti (dipertahankan) |
| `.invoice-actions` | (global): display, gap | (global): gap<br>@media (max-width: 800px): gap | Override properti (dipertahankan) |
| `.mini-action` | (global): border, background, border-radius, padding, cursor, font-size, font-weight, white-space | (global): transition<br>(global): min-height, padding, border-radius<br>@media (prefers-reduced-motion: reduce): transition<br>(global): font-weight<br>(global): min-height | Override properti (dipertahankan) |
| `.mobile-aging-grid span` | (global): background, border-radius, padding, font-size, color | (global): border, background | Override properti (dipertahankan) |
| `.mobile-customer-card` | (global): border, border-radius, padding, margin | @media (max-width: 520px): margin, padding<br>(global): border-color, border-radius, box-shadow<br>@media (max-width: 520px): margin-left, margin-right<br>@media (min-width: 801px) and (max-width: 1100px): margin | Override properti (dipertahankan) |
| `.mobile-customer-head span` | (global): color, font-size | (global): color | Override properti (dipertahankan) |
| `.mobile-customer-total span` | (global): color, font-size | (global): color | Override properti (dipertahankan) |
| `.mobile-data-cards` | (global): display<br>@media (max-width: 800px): display | @media (min-width: 801px) and (max-width: 1100px): display | Additif / konteks berbeda |
| `.mobile-menu-toggle` | (global): display<br>@media (max-width: 1100px): display, place-items, flex, width, height, padding, border, border-radius, background, color, cursor, box-shadow, -webkit-tap-highlight-color<br>@media (max-width: 520px): flex-basis, width, height | @media (max-width: 1100px): width, height, min-width, display, flex-direction, align-items, justify-content, gap, padding, border, border-radius, background, color, box-shadow, cursor<br>@media (max-width: 520px): width, height, min-width | Override properti (dipertahankan) |
| `.mobile-menu-toggle span` | @media (max-width: 1100px): display, width, height, margin, border-radius, background | @media (max-width: 1100px): width, height, border-radius, background | Override properti (dipertahankan) |
| `.mobile-menu-toggle:active` | @media (max-width: 1100px): transform | @media (max-width: 1100px): transform | Properti sama; cek blok identik |
| `.modal` | (global): position, inset, z-index, display, place-items, padding<br>@media (max-width: 1100px): padding, align-items | @media (max-width: 520px): padding | Additif / konteks berbeda |
| `.modal-backdrop` | (global): position, inset, background | (global): background, backdrop-filter, -webkit-backdrop-filter<br>(global): background | Override properti (dipertahankan) |
| `.modal-body` | (global): padding | @media (max-width: 520px): padding-left, padding-right<br>(global): padding | Override properti (dipertahankan) |
| `.modal-close` | (global): border, background, font-size, cursor, color | (global): width, height, display, place-items, border-radius | Additif / konteks berbeda |
| `.modal-header` | (global): display, justify-content, align-items, padding, border-bottom | (global): background<br>@media (max-width: 520px): padding-left, padding-right<br>(global): padding | Override properti (dipertahankan) |
| `.modal-header h3` | (global): margin, font-size | (global): color, letter-spacing | Additif / konteks berbeda |
| `.modal-panel` | (global): position, width, max-height, overflow, background, border-radius, box-shadow<br>@media (max-width: 1100px): width, max-height, border-radius | (global): border<br>@media (max-width: 520px): border-radius<br>(global): border-color, border-radius, box-shadow<br>@media (max-width: 800px): box-shadow | Override properti (dipertahankan) |
| `.nav` | (global): display, gap<br>@media (max-width: 800px): grid-template-columns<br>@media (max-width: 1100px): grid-template-columns, gap | (global): gap | Override properti (dipertahankan) |
| `.nav-item` | (global): color, text-decoration, padding, border-radius, font-size<br>@media (max-width: 1100px): min-height, display, align-items, padding, border-radius | (global): position, min-height, display, align-items, padding, border, border-radius, color, transition<br>@media (prefers-reduced-motion: reduce): transition<br>(global): color, border-color | Override properti (dipertahankan) |
| `.nav-item:hover` | (global): background, color | (global): background, color, transform | Override properti (dipertahankan) |
| `.nav-item.active` | (global): background, color | (global): background, border-color, color, box-shadow | Override properti (dipertahankan) |
| `.page-content` | (global): flex, padding<br>@media (max-width: 800px): padding<br>@media (max-width: 1100px): width, max-width, padding, overflow-x<br>@media (max-width: 520px): padding | @media (max-width: 520px): padding<br>(global): width, max-width, margin, padding<br>@media (min-width: 1200px): padding-left, padding-right<br>@media (max-width: 800px): padding<br>@media (max-width: 1100px): width, max-width, min-width, overflow-x<br>@media (max-width: 800px): width, padding<br>@media (max-width: 1100px): padding-top<br>@media (max-width: 520px): padding-top | Override properti (dipertahankan) |
| `.page-description` | (global): margin, color<br>@media (max-width: 1100px): line-height, font-size | (global): color, line-height | Override properti (dipertahankan) |
| `.page-heading` | (global): display, align-items, justify-content, gap, margin-bottom<br>@media (max-width: 800px): flex-direction<br>@media (max-width: 1100px): gap | (global): margin-bottom | Override properti (dipertahankan) |
| `.page-heading h2` | (global): margin, font-size<br>@media (max-width: 520px): font-size<br>@media (max-width: 1100px): line-height | (global): color, letter-spacing<br>@media (max-width: 800px): font-size<br>@media (max-width: 520px): font-size<br>@media (max-width: 1100px): position, z-index | Override properti (dipertahankan) |
| `.page-size select` | (global): border, border-radius, padding, background | (global): border-color, border-radius | Override properti (dipertahankan) |
| `.pagination` | (global): display, align-items, justify-content, gap, padding, color, font-size<br>@media (max-width: 520px): gap<br>@media (max-width: 520px): flex-wrap | (global): border-top, background | Additif / konteks berbeda |
| `.search-box` | (global): flex, max-width, display, align-items, gap, border, border-radius, padding, background<br>@media (max-width: 800px): max-width<br>@media (max-width: 520px): min-height | (global): border-color, background, border-radius, transition<br>@media (prefers-reduced-motion: reduce): transition | Override properti (dipertahankan) |
| `.sidebar` | (global): width, min-height, background, color, display, flex-direction, padding, position, inset<br>@media (max-width: 800px): position, width, min-height<br>@media (max-width: 1100px): position, z-index, inset, width, max-width, min-width, min-height, height, max-height, padding, transform, transition, box-shadow, overflow-x, overflow-y, overscroll-behavior<br>@media (prefers-reduced-motion: reduce): transition | (global): padding, border-right, box-shadow<br>@media (max-width: 800px): padding<br>(global): background, color, border-right, box-shadow<br>@media (max-width: 1100px): background | Override properti (dipertahankan) |
| `.sidebar-close` | (global): display<br>@media (max-width: 1100px): display, place-items, flex, width, height, border, border-radius, background, color, font-size, line-height, cursor, -webkit-tap-highlight-color | @media (max-width: 1100px): border-color, background, color | Override properti (dipertahankan) |
| `.sidebar-close:active` | @media (max-width: 1100px): background | @media (max-width: 1100px): background | Override properti (dipertahankan) |
| `.sidebar-footer` | (global): margin-top, display, gap, align-items, color, font-size, padding<br>@media (max-width: 1100px): padding | (global): margin, padding, border-top, font-size<br>(global): color, border-top-color | Override properti (dipertahankan) |
| `.stat-card` | (global): background, border, border-radius, padding, box-shadow<br>@media (max-width: 520px): border-radius | (global): border-color, box-shadow<br>(global): border-radius<br>@media (prefers-reduced-motion: reduce): transition | Override properti (dipertahankan) |
| `.stat-card strong` | (global): display, font-size, margin | (global): color, letter-spacing | Additif / konteks berbeda |
| `.status-dot` | (global): width, height, flex, border-radius, background | (global): width, height, box-shadow | Override properti (dipertahankan) |
| `.summary-card` | (global): background, border, border-radius, padding, box-shadow<br>@media (max-width: 1100px): min-width<br>@media (max-width: 520px): border-radius | (global): border-color, box-shadow<br>(global): border-radius<br>@media (max-width: 800px): padding<br>@media (max-width: 520px): padding<br>@media (prefers-reduced-motion: reduce): transition<br>(global): position, overflow<br>@media (min-width: 801px) and (max-width: 1100px): min-width | Override properti (dipertahankan) |
| `.summary-card small` | (global): display, color<br>(global): font-size | (global): line-height | Additif / konteks berbeda |
| `.summary-card strong` | (global): display, margin, font-size | (global): color, letter-spacing<br>(global): font-size<br>@media (min-width: 801px) and (max-width: 1100px): overflow-wrap, font-size | Override properti (dipertahankan) |
| `.supplier-detail-summary strong` | (global): display, font-size<br>@media (max-width:520px): font-size | (global): font-variant-numeric | Additif / konteks berbeda |
| `.supplier-detail-table td:nth-child(4)` | (global): min-width, text-align, white-space<br>@media (max-width: 800px): min-width | (global): font-variant-numeric | Additif / konteks berbeda |
| `.supplier-detail-table td:nth-child(5)` | (global): min-width, text-align, white-space<br>@media (max-width: 800px): min-width | (global): font-variant-numeric | Additif / konteks berbeda |
| `.table-scroll` | (global): overflow-x<br>@media (max-width: 800px): display | @media (min-width: 1101px): width, overflow-x<br>@media (min-width: 801px) and (max-width: 1100px): display | Additif / konteks berbeda |
| `.table-state` | (global): padding, text-align, color | (global): min-height, display, flex-direction, align-items, justify-content, gap, padding, line-height<br>(global): border-color | Override properti (dipertahankan) |
| `.table-state.empty` | (global): color | (global): background | Additif / konteks berbeda |
| `.table-state.error` | (global): color | (global): color<br>(global): background | Properti sama; cek blok identik |
| `.toolbar` | (global): display, gap, justify-content, padding, border-bottom<br>@media (max-width: 800px): flex-direction<br>@media (max-width: 520px): padding | (global): padding, background<br>@media (max-width: 800px): gap<br>@media (max-width: 900px): flex-wrap | Override properti (dipertahankan) |
| `.topbar` | (global): min-height, background, border-bottom, display, justify-content, align-items, padding<br>@media (max-width: 1100px): position, top, z-index, min-height, padding, gap<br>@media (max-width: 520px): padding<br>(global): display | @media (max-width: 520px): padding<br>(global): min-height, padding, box-shadow<br>@media (max-width: 800px): min-height, padding, box-shadow<br>@media (max-width: 1100px): width, max-width, min-width | Override properti (dipertahankan) |
| `.topbar h1` | (global): margin, font-size<br>@media (max-width: 1100px): font-size, line-height | (global): color, font-size, letter-spacing<br>@media (max-width: 1100px): overflow, text-overflow, white-space | Override properti (dipertahankan) |
| `.topbar-left` | (global): display, align-items, gap, min-width<br>@media (max-width: 520px): gap | @media (max-width: 1100px): min-width, flex | Additif / konteks berbeda |
| `.welcome-card` | (global): background, border, border-radius, box-shadow, padding, margin-bottom<br>@media (max-width: 520px): border-radius<br>@media (max-width: 520px): padding | (global): border-color, box-shadow<br>(global): border-radius<br>@media (max-width: 520px): padding<br>@media (prefers-reduced-motion: reduce): transition | Override properti (dipertahankan) |
| `.welcome-card h2` | (global): margin, font-size | (global): color, letter-spacing | Additif / konteks berbeda |
| `body` | (global): margin, min-height, font-family, background, color<br>@media (max-width: 1100px): overflow-x | (global): color, -webkit-font-smoothing, text-rendering | Override properti (dipertahankan) |
| `button` | (global): font | (global): -webkit-tap-highlight-color | Additif / konteks berbeda |
| `input` | (global): font | (global): -webkit-tap-highlight-color | Additif / konteks berbeda |
| `select` | (global): font | (global): -webkit-tap-highlight-color | Additif / konteks berbeda |


## Catatan pemeriksaan browser — 2026-10-25

Pemeriksaan read-only dilakukan pada domain aplikasi dengan viewport 1440×900 dan 1024×768. Namun, halaman yang dilayani masih memuat cache key CSS lama (`app.css?v=20261015-shell-owner-v1` dan `ui-polish.css?v=20261020-light-sidebar-v1`), sehingga belum membuktikan stylesheet baru dari branch ini sudah ter-deploy. Pada sesi tersebut, tiga request Dashboard menerima pesan SID Retail `server offline`; karena itu data panel, modal detail berbasis data, dan PDF/cetak tidak dapat dinyatakan lolos QA.

Pembersihan source hanya menghapus blok duplikat identik dan mempertahankan blok yang tersisa. File Invoice/Kalkulator tidak berubah. Ulangi pemeriksaan desktop/tablet/modal/cetak setelah deployment branch ini benar-benar tampil dan endpoint SID Retail merespons normal.

## QA follow-up — 2026-10-25

Pemeriksaan ulang dilakukan setelah cache key baru diterapkan. Browser live memuat `app.css?v=20261025-css-dedup-v1` dan `ui-polish.css?v=20261025-css-dedup-v1`.

- Dashboard tampil pada desktop 1440×900 dan tablet 1024×768; tidak terlihat horizontal overflow.
- Pada sesi pemeriksaan terakhir, indikator API tampil online dan panel Dashboard berhasil menampilkan data.
- Halaman Invoice dan pratinjau layar terbuka dengan data contoh yang hanya dimasukkan lokal dan tidak disimpan.
- Halaman Pelanggan tidak selesai dimuat karena request API timeout, sehingga modal detail Pelanggan/Piutang belum dapat divalidasi.
- Tombol cetak membuka tab `about:blank` pada browser QA dan tidak menghasilkan halaman pratinjau yang dapat diperiksa. Tidak ada perubahan pada `invoice.css`; hasil cetak tetap memerlukan verifikasi manual di browser/printer pengguna.

Catatan browser sebelumnya yang menyebut cache CSS lama dan API Dashboard offline menggambarkan sesi awal saja. Hasil follow-up di atas menggantikannya untuk kondisi terbaru. Validasi visual desktop/tablet berhasil; validasi modal dan hasil cetak masih tertunda karena batas layanan/browser pada sesi ini.
