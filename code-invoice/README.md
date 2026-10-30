# Invoice Spreadsheet Backend

Source Google Apps Script untuk penyimpanan halaman Invoice. Proyek ini tetap terpisah dari GAS SID Retail dan memakai Spreadsheet Invoice yang sudah disiapkan.

## Isi folder

- `setup.gs`: menyiapkan sheet Invoice yang ada dan menyediakan `setupNipponPriceListSheet()` untuk membuat tab `NipponPriceList` saja, tanpa mengubah sheet Invoice.
- `Code.gs`: validasi, hitung ulang pajak di server, simpan draft, buka invoice, daftar invoice, serta JSON API untuk halaman statis.
- `Bridge.html`: jembatan versi lama. Frontend saat ini memakai fetch langsung; file dan rute bridge dipertahankan sementara sebagai fallback.

## Struktur data

`Invoices` menyimpan identitas invoice, tanggal, penerima, nomor nota, subtotal harga termasuk PPN, DPP, potongan PPN, pengaturan dan potongan PPh, jumlah yang harus dibayar, rekening, penanda tangan, status draft, serta waktu pembuatan/perubahan.

`InvoiceItems` menyimpan baris barang dengan relasi `invoice_id`, urutan baris, nama, qty, satuan, harga termasuk pajak, dan jumlah baris.

`Config` diisi default rekening BRI Wasimun yang sama dengan halaman Invoice. Data rekening per invoice tetap disalin ke `Invoices` agar riwayat lama tidak berubah ketika default konfigurasi diperbarui.

## Penyiapan awal

1. Buat Spreadsheet dan proyek Apps Script khusus Invoice.
2. Salin `setup.gs` dan `Code.gs` ke proyek GAS tersebut. `Bridge.html` tidak diperlukan untuk frontend fetch saat ini.
3. Bila proyek GAS standalone, set Script Property `INVOICE_SPREADSHEET_ID` ke ID Spreadsheet. Bila project terikat langsung ke Spreadsheet Invoice, properti itu boleh dikosongkan.
4. Jalankan `setupInvoiceSpreadsheet()` hanya untuk penyiapan awal dan beri izin Spreadsheet saat diminta. Jangan jalankan ulang hanya untuk memperbarui kode.
5. Setelah perubahan GAS, simpan lalu deploy sebagai **versi baru** pada deployment web app yang sama agar URL `/exec` tetap sama.
6. Deployment harus dapat dipanggil oleh browser aplikasi di `https://admin.tbnusantara.com`. Pada pola fetch publik seperti repo WiFi, pilih akses yang mengizinkan pengguna aplikasi memanggil endpoint. Perubahan izin ini membuat endpoint dapat dipanggil pihak lain juga; lihat catatan keamanan di bawah.
7. Deploy perubahan frontend dari branch `ui/ux-polish-v3` melalui proses hosting GitHub Pages yang biasa, lalu hard refresh browser.

URL health `/exec` (tanpa parameter atau dengan `?action=health`) mengembalikan JSON dengan `status: "ok"`, `storageReady: true`, `priceListReady`, build saat ini, dan daftar action API.

## Kontrak API fetch

Semua endpoint menggunakan URL deployment web app GAS yang sama.

### GET

- `?action=health`: status layanan dan kesiapan sheet; tidak membaca isi invoice dan tidak menulis data.
- `?action=listInvoices&searchText=...&limit=20`: daftar invoice terbaru/cocok.
- `?action=getInvoice&invoiceId=...`: header dan rincian invoice.
- `?action=listNipponPrices&searchText=...&limit=200`: daftar HPP dasar Nippon Paint (maksimum 500 produk).

Contoh response sukses:

```json
{"success":true,"data":[]}
```

### POST

Frontend mengirim JSON sebagai `Content-Type: text/plain;charset=utf-8` untuk mengikuti pola fetch repo WiFi tanpa preflight JSON. Payload `saveInvoice`:

```json
{
  "action": "saveInvoice",
  "invoiceNumber": "INV-20261017-120000",
  "invoiceDate": "2026-10-17",
  "recipientName": "Nama penerima",
  "items": [{"name": "Nama barang", "qty": 1, "unit": "pcs", "price": 15000}],
  "pphEnabled": false
}
```

Field lain yang didukung: `invoiceId` (untuk memperbarui draft), `noteNumber`, `recipientAddress`, `recipientPhone`, `bank`, `accountName`, `accountNumber`, dan `signerName`. Harga input sudah termasuk PPN. Server menghitung ulang DPP, PPN, PPh (jika aktif), dan total bayar. Response sukses dibungkus sebagai `{"success":true,"data":...}`; kegagalan sebagai `{"success":false,"message":"..."}`.

## Nippon Paint

Price List memakai Spreadsheet Invoice yang sama, tetapi data disimpan pada tab terpisah `NipponPriceList` dengan kolom `price_id`, `product_name`, `size`, `base_cost`, `active`, `created_at`, dan `updated_at`.

Setelah menambahkan source terbaru ke proyek GAS Invoice, jalankan `setupNipponPriceListSheet()` satu kali. Fungsi ini hanya membuat/memeriksa tab `NipponPriceList`; fungsi ini tidak mengubah tab Invoice. Jangan menjalankan `setupInvoiceSpreadsheet()` untuk menyiapkan daftar Nippon.

- GET `?action=listNipponPrices&searchText=...&limit=200` membaca produk aktif.
- POST `{"action":"saveNipponPrice","productName":"Weatherbond","size":"5 L","baseCost":450000}` menambah produk.
- Untuk edit, sertakan `priceId` dari hasil daftar/simpan. Produk dengan kombinasi nama dan ukuran yang sama ditolak agar tidak terduplikasi.
- Harga tersimpan adalah HPP dasar sebelum tinta. Halaman menghitung perkiraan HPP warna dengan menambahkan biaya tinta manual per kemasan; biaya tinta hasil input tidak disimpan.

Setelah mengubah GAS, deploy sebagai versi web app baru pada deployment yang sama. Health akan menyertakan `priceListReady: true` setelah tab siap. Frontend memakai action di deployment Invoice yang sama.

## Fungsi backend dan kompatibilitas

- `doGet(e)`: health check atau action GET Invoice/Nippon di atas. Rute lama `?mode=bridge&nonce=...` tetap tersedia sementara untuk rollback.
- `doPost(e)`: menerima `saveInvoice` dan `saveNipponPrice`; action Invoice tetap memakai fungsi simpan draft yang sudah ada.
- `saveInvoice(payload)`: membuat draft baru atau memperbarui draft menggunakan `invoiceId`.
- `getInvoice(invoiceId)`: memuat header beserta item.
- `listInvoices(searchText, limit)`: mencari berdasarkan nomor invoice, nomor nota, nama, atau telepon.

Tidak ada fungsi yang membaca atau menulis ke API SID Retail. Tidak ada fungsi untuk menghapus draft. Semua invoice yang disimpan berstatus `DRAFT` sampai alur finalisasi ditentukan. Perhitungan, validasi, struktur Spreadsheet, dan tampilan invoice tidak diubah oleh perpindahan transport; fetch hanya menggantikan jalur komunikasi frontend ke GAS.

## Keamanan dan batasan

Pola fetch langsung ini mengikuti repo WiFi dan tidak menyediakan autentikasi aplikasi dengan sendirinya. URL deployment berada di frontend dan bukan rahasia. Jika deployment mengizinkan akses publik/anonim, pengguna yang mengetahui URL dapat mencoba memanggil fungsi baca/tulis Invoice maupun Price List; CORS bukan mekanisme autentikasi dan tidak mencegah pemanggilan dari server atau klien lain. Jangan menyimpan token rahasia di JavaScript browser.

GAS ContentService dapat mengalihkan response ke domain `script.googleusercontent.com`; frontend harus membaca body response lalu mem-parsing JSON. Jika fetch gagal, periksa Console dan Network browser serta pastikan kode GAS dan deployment versi terbaru sudah aktif.

