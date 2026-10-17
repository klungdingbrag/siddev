# Invoice Spreadsheet Backend

Source Google Apps Script untuk penyimpanan halaman Invoice. Proyek ini tetap terpisah dari GAS SID Retail dan memakai Spreadsheet Invoice yang sudah disiapkan.

## Isi folder

- `setup.gs`: membuat sheet `Invoices`, `InvoiceItems`, dan `Config` tanpa menimpa sheet/header yang sudah terisi.
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

URL health `/exec` (tanpa parameter atau dengan `?action=health`) harus mengembalikan JSON dengan `status: "ok"`, `storageReady: true`, build `2026-10-17-fetch-api-v1`, dan daftar action API.

## Kontrak API fetch

Semua endpoint menggunakan URL deployment web app GAS yang sama.

### GET

- `?action=health`: status layanan dan kesiapan sheet; tidak membaca isi invoice dan tidak menulis data.
- `?action=listInvoices&searchText=...&limit=20`: daftar invoice terbaru/cocok.
- `?action=getInvoice&invoiceId=...`: header dan rincian invoice.

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

## Fungsi backend dan kompatibilitas

- `doGet(e)`: health check atau action GET di atas. Rute lama `?mode=bridge&nonce=...` tetap tersedia sementara untuk rollback.
- `doPost(e)`: hanya menerima action `saveInvoice` dan meneruskannya ke fungsi penyimpanan yang sudah ada.
- `saveInvoice(payload)`: membuat draft baru atau memperbarui draft menggunakan `invoiceId`.
- `getInvoice(invoiceId)`: memuat header beserta item.
- `listInvoices(searchText, limit)`: mencari berdasarkan nomor invoice, nomor nota, nama, atau telepon.

Tidak ada fungsi yang membaca atau menulis ke API SID Retail. Tidak ada fungsi untuk menghapus draft. Semua invoice yang disimpan berstatus `DRAFT` sampai alur finalisasi ditentukan. Perhitungan, validasi, struktur Spreadsheet, dan tampilan invoice tidak diubah oleh perpindahan transport; fetch hanya menggantikan jalur komunikasi frontend ke GAS.

## Keamanan dan batasan

Pola fetch langsung ini mengikuti repo WiFi dan tidak menyediakan autentikasi aplikasi dengan sendirinya. URL deployment berada di frontend dan bukan rahasia. Jika deployment mengizinkan akses publik/anonim, pengguna yang mengetahui URL dapat mencoba memanggil fungsi baca/tulis; CORS bukan mekanisme autentikasi dan tidak mencegah pemanggilan dari server atau klien lain. Jangan menyimpan token rahasia di JavaScript browser. Untuk invoice produksi yang memerlukan akses terbatas, tambahkan lapisan autentikasi/backend perantara sebelum membuka akses publik.

GAS ContentService dapat mengalihkan response ke domain `script.googleusercontent.com`; frontend harus membaca body response lalu mem-parsing JSON. Jika fetch gagal, periksa Console dan Network browser serta pastikan kode GAS dan deployment versi terbaru sudah aktif.

