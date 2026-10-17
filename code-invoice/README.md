# Invoice Spreadsheet Backend

Source GAS untuk penyimpanan halaman Invoice, terpisah dari proyek GAS SID Retail.

## Isi folder

- `setup.gs`: membuat sheet `Invoices`, `InvoiceItems`, dan `Config` tanpa menimpa sheet/header yang sudah terisi.
- `Code.gs`: validasi, hitung ulang nilai pajak di server, simpan draft, buka invoice, dan daftar invoice.

## Struktur data

`Invoices` menyimpan identitas invoice, tanggal, penerima, nomor nota, subtotal harga termasuk PPN, DPP, potongan PPN, pengaturan dan potongan PPh, jumlah yang harus dibayar, rekening, penanda tangan, status draft, serta waktu pembuatan/perubahan.

`InvoiceItems` menyimpan baris barang dengan relasi `invoice_id`, urutan baris, nama, qty, satuan, harga termasuk pajak, dan jumlah baris.

`Config` diisi default rekening BRI Wasimun yang sama dengan halaman Invoice. Data rekening per invoice tetap disalin ke `Invoices` agar riwayat lama tidak berubah ketika default konfigurasi diperbarui.

## Penyiapan awal

1. Buat Spreadsheet dan proyek Apps Script khusus Invoice.
2. Tambahkan isi `setup.gs` dan `Code.gs` ke proyek GAS tersebut.
3. Bila proyek GAS standalone, set Script Property `INVOICE_SPREADSHEET_ID` ke ID Spreadsheet. Bila project terikat langsung ke Spreadsheet Invoice, properti itu boleh dikosongkan.
4. Jalankan `setupInvoiceSpreadsheet()` dari editor Apps Script dan beri izin Spreadsheet saat diminta.
5. Pastikan tab dan header berhasil dibuat sebelum menghubungkan halaman Invoice.
6. Setelah menambahkan atau mengubah file GAS, buat deployment versi baru atau edit deployment agar memakai versi terbaru. Membuka URL `/exec` seharusnya menampilkan JSON health check; endpoint ini belum menyediakan operasi simpan/buka untuk halaman HTML statis.

## Fungsi backend

- `doGet()`: health check JSON baca-saja untuk memastikan deployment aktif; tidak membaca atau mengubah data invoice.
- `saveInvoice(payload)`: membuat draft baru atau memperbarui draft menggunakan `invoiceId`.
- `getInvoice(invoiceId)`: memuat header beserta item.
- `listInvoices(searchText, limit)`: mencari berdasarkan nomor invoice, nomor nota, nama, atau telepon.

Kontrak payload `saveInvoice` mengikuti field halaman sekarang: `invoiceNumber`, `invoiceDate`, `noteNumber`, `recipientName`, `recipientAddress`, `recipientPhone`, `items[{name, qty, unit, price}]`, `pphEnabled`, `bank`, `accountName`, `accountNumber`, dan `signerName`. Untuk memperbarui, tambahkan `invoiceId` dari hasil simpan sebelumnya.

## Akses dan deployment

Fungsi CRUD ditujukan untuk pemanggilan dari halaman Apps Script HTML Service melalui `google.script.run`, yang memberi pemisahan server/client Apps Script. Halaman SID Retail saat ini adalah HTML statis, sehingga tidak dapat langsung memanggil `google.script.run`. Jangan menambahkan API tulis publik `doPost` atau menanam token rahasia di JavaScript browser. Pilihan jembatan yang aman untuk menyatukan UI statis dengan GAS perlu ditentukan sebelum deployment; source backend dan skema Spreadsheet ini belum mengubah halaman atau deployment SID Retail.

Tidak ada fungsi yang membaca atau menulis ke API SID Retail. Tidak ada fungsi untuk menghapus draft. Semua invoice yang disimpan berstatus `DRAFT` sampai alur finalisasi ditentukan.
