# Tabungan Pelanggan

Status: halaman baca-saja ditambahkan ke `ui/ux-polish-v3` pada 26 Oktober 2026.

## Tujuan

Menampilkan pelanggan yang mempunyai saldo tabungan positif, baik pelanggan tersebut mempunyai piutang maupun tidak. Halaman ini terpisah dari halaman Pelanggan supaya fokus dan ringkasan saldo tabungan tidak mencampur data piutang.

## Sumber dan aturan data

- Daftar memakai action API `pelanggan` yang sudah dipakai halaman Pelanggan.
- Filter halaman: `saldo_tabungan > 0`.
- Nilai saldo master berasal dari `pelanggan.saldo_tabungan`.
- Riwayat memakai action `pelangganTabunganHistory` yang sudah tersedia.
- Detail meminta maksimum 500 transaksi. Backend mengurutkan riwayat menaik menurut tanggal, jam, dan kode, sehingga ketika jumlahnya melebihi batas, respons berisi transaksi tertua. Antarmuka menyebut batas tersebut dan menggunakan saldo master sebagai saldo saat ini.
- Bila ringkasan rekonstruksi riwayat berbeda dari saldo master, antarmuka menampilkan catatan perbedaan. Catatan ini bukan tindakan koreksi akuntansi.

## Perilaku antarmuka

- Ringkasan total saldo dan jumlah pelanggan dihitung dari seluruh daftar yang dimuat, bukan hasil pencarian atau halaman yang sedang terlihat.
- Pencarian meliputi kode, nama, dan alamat. Pagination berjalan di browser.
- Cache daftar berbagi key `sidretail:customer:v1` dengan halaman Pelanggan dan berumur dua menit. Halaman menampilkan cache lebih dahulu sambil meminta data baru.
- Desktop memakai tabel; layar kecil memakai kartu dan tampilan riwayat yang responsif.
- Modal detail menampilkan saldo master dan riwayat; tidak menampilkan piutang.

## Batas perubahan dan deployment

Fitur ini tidak mengubah GAS, SQL, format data backend, halaman Pelanggan, alur Piutang, atau penyimpanan transaksi. Tidak ada aksi menambah atau mengubah saldo. Implementasi berada pada `assets/js/pages/tabungan-pelanggan.js`, `assets/css/tabungan-pelanggan.css`, routing di `assets/js/app.js`, dan pemuatan aset di `index.html`.

Perubahan source tercatat pada branch GitHub. Halaman aktif setelah branch ini dipublikasikan oleh alur deployment situs.
