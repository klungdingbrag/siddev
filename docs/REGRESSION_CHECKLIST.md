# Checklist Regresi UI/UX — ui/ux-polish-v3

Checklist ini menjaga perilaku yang sudah berjalan saat ada perubahan kecil. Tandai hasil dan tanggal uji pada PR/commit atau catatan rilis.

## Pemeriksaan otomatis

Jalankan dari root repository dengan Node.js:

```sh
npm test
```

Uji otomatis saat ini hanya mencakup fungsi normalisasi data dashboard yang murni; ia tidak menggantikan pemeriksaan browser atau validasi data GAS.

## Checklist browser

### Navigasi dan API

- [ ] Dashboard terbuka dan menampilkan ringkasan serta grafik.
- [ ] Pindah ke halaman lain lalu kembali ke Dashboard; cache tampil tanpa menunggu pemuatan awal backend.
- [ ] Refresh manual Dashboard memuat ulang data dan status kesegaran terlihat benar.
- [ ] Pelanggan, Piutang, dan Hutang Supplier dapat dibuka; detail modal tetap bekerja.
- [ ] Jika satu panel mengalami kegagalan, panel lain dan navigasi tetap dapat digunakan.
- [ ] Uji melalui deployment Development yang sesuai; jangan gunakan checklist ini untuk mengizinkan perubahan atau deployment Production.

### Invoice dan pajak

- [ ] Draft invoice dapat dibuat, disimpan, dibuka kembali, dan diedit.
- [ ] Pratinjau invoice dan hasil PDF konsisten.
- [ ] Perhitungan PPN/PPh dan jumlah bersih sesuai input yang sama.
- [ ] Logo dan kop tetap terlihat jelas pada PDF.

### Surat Jalan dan cetak

- [ ] Surat Jalan tanpa harga menampilkan data penerima dan item yang benar.
- [ ] Pagination menempatkan maksimal enam item pada tiap setengah lembar A4 portrait.
- [ ] Untuk jumlah halaman ganjil, setengah lembar terakhir dibiarkan kosong.
- [ ] Area penerima/pengirim, perhatian, dan tanda tangan tidak terpotong.
- [ ] Periksa pratinjau cetak dan hasil dot matrix pada kertas 2 ply.

### Tampilan dan aksesibilitas

- [ ] Uji ukuran desktop dan tablet: sidebar, pencarian, kartu ringkasan, tabel, dan modal tidak bertumpuk.
- [ ] Navigasi keyboard dapat mencapai kontrol utama; modal dapat ditutup dengan Escape.
- [ ] Pesan loading, data kosong, cache, dan error dapat dibedakan.

## Batasan

- Uji unit tidak memanggil GAS dan tidak membuktikan deployment atau data backend sehat.
- Browser/PDF/cetak harus diperiksa manual pada Development sebelum perubahan visual atau API dianggap siap.
- Perubahan pada kontrak tulis, saldo, piutang, atau hutang memerlukan audit terpisah dan bukti dari environment Development.
