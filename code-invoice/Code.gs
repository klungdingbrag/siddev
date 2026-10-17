/**
 * Invoice storage backend for a dedicated Apps Script project.
 *
 * Public callable functions:
 *   saveInvoice(payload)
 *   getInvoice(invoiceId)
 *   listInvoices(searchText, limit)
 *
 * Keep this project separate from the SID Retail Apps Script. The CRUD functions are
 * intended to be called from an authorized Apps Script HTML Service page via
 * google.script.run. Do not expose an unauthenticated public doPost endpoint.
 */

const INV_SPREADSHEET_PROPERTY = "INVOICE_SPREADSHEET_ID";
const INV_PPH_RATE = 0.015;
const INV_VAT_INCLUDED_RATE = 0.11;

function invoiceGetSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(INV_SPREADSHEET_PROPERTY);
  if (id) return SpreadsheetApp.openById(id);

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  throw new Error(
    "Spreadsheet Invoice belum dikonfigurasi. Set Script Property " +
    INV_SPREADSHEET_PROPERTY + " atau bind project ke Spreadsheet Invoice."
  );
}

function invoiceGetSheets_() {
  const spreadsheet = invoiceGetSpreadsheet_();
  const invoices = spreadsheet.getSheetByName("Invoices");
  const items = spreadsheet.getSheetByName("InvoiceItems");
  if (!invoices || !items) {
    throw new Error("Sheet belum tersedia. Jalankan setupInvoiceSpreadsheet() terlebih dahulu.");
  }
  return { spreadsheet: spreadsheet, invoices: invoices, items: items };
}

function invoiceWithLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function invoiceHeaderMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  return headers.reduce(function (map, header, index) {
    map[header] = index;
    return map;
  }, {});
}

function invoiceFindRow_(sheet, headerName, value) {
  const map = invoiceHeaderMap_(sheet);
  if (map[headerName] === undefined || sheet.getLastRow() < 2) return -1;
  const values = sheet.getRange(2, map[headerName] + 1, sheet.getLastRow() - 1, 1)
    .getDisplayValues();
  const target = String(value);
  for (let index = 0; index < values.length; index += 1) {
    if (String(values[index][0]) === target) return index + 2;
  }
  return -1;
}

function invoiceText_(value, maxLength, label, required) {
  const text = String(value == null ? "" : value).trim();
  if (required && !text) throw new Error(label + " wajib diisi.");
  if (text.length > maxLength) throw new Error(label + " maksimal " + maxLength + " karakter.");
  return text;
}

function invoiceNumber_(value, label, minimum) {
  if (typeof value === "string" && !value.trim()) {
    throw new Error(label + " harus berupa angka.");
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) {
    throw new Error(label + " tidak valid.");
  }
  return number;
}

function invoiceBuildPayload_(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Data invoice tidak valid.");
  }

  const invoiceDate = invoiceText_(payload.invoiceDate, 10, "Tanggal invoice", true);
  const parsedInvoiceDate = new Date(invoiceDate + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) ||
      isNaN(parsedInvoiceDate.getTime()) ||
      parsedInvoiceDate.toISOString().slice(0, 10) !== invoiceDate) {
    throw new Error("Tanggal invoice harus berupa tanggal valid dengan format YYYY-MM-DD.");
  }

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items = rawItems.map(function (item, index) {
    const name = invoiceText_(item && item.name, 250, "Nama barang baris " + (index + 1), false);
    const unit = invoiceText_(item && item.unit, 40, "Satuan baris " + (index + 1), false);
    const rawQty = item && item.qty;
    const rawPrice = item && item.price;

    // Empty UI rows are ignored; partially entered rows are rejected.
    if (!name && (rawPrice === "" || rawPrice == null)) return null;
    if (!name) throw new Error("Nama barang baris " + (index + 1) + " wajib diisi.");
    const qty = invoiceNumber_(rawQty, "Qty baris " + (index + 1), 0.000001);
    const price = invoiceNumber_(rawPrice, "Harga baris " + (index + 1), 0);
    const amount = Math.round(qty * price);
    if (!Number.isSafeInteger(amount)) throw new Error("Jumlah barang terlalu besar.");
    return { name: name, qty: qty, unit: unit, price: Math.round(price), amount: amount };
  }).filter(function (item) { return item !== null; });

  if (!items.length) throw new Error("Tambahkan minimal satu barang yang valid.");

  const subtotalGross = items.reduce(function (sum, item) { return sum + item.amount; }, 0);
  if (!Number.isSafeInteger(subtotalGross)) throw new Error("Subtotal invoice terlalu besar.");
  const dpp = Math.round(subtotalGross / (1 + INV_VAT_INCLUDED_RATE));
  const ppn = subtotalGross - dpp;
  const pphEnabled = payload.pphEnabled === true;
  const pph = pphEnabled ? Math.round(dpp * INV_PPH_RATE) : 0;

  return {
    invoiceId: invoiceText_(payload.invoiceId, 80, "ID invoice", false),
    invoiceNumber: invoiceText_(payload.invoiceNumber, 80, "Nomor invoice", true),
    invoiceDate: invoiceDate,
    noteNumber: invoiceText_(payload.noteNumber, 100, "Nomor nota", false),
    recipientName: invoiceText_(payload.recipientName, 200, "Kepada Yth.", true),
    recipientAddress: invoiceText_(payload.recipientAddress, 1000, "Alamat penerima", false),
    recipientPhone: invoiceText_(payload.recipientPhone, 40, "Nomor HP", false),
    items: items,
    totalQty: items.reduce(function (sum, item) { return sum + item.qty; }, 0),
    subtotalGross: subtotalGross,
    dpp: dpp,
    ppnDeduction: ppn,
    pphEnabled: pphEnabled,
    pphRate: pphEnabled ? INV_PPH_RATE : 0,
    pphDeduction: pph,
    totalPayable: subtotalGross - ppn - pph,
    bank: invoiceText_(payload.bank, 100, "Bank", false),
    accountName: invoiceText_(payload.accountName, 150, "Nama rekening", false),
    accountNumber: invoiceText_(payload.accountNumber, 80, "Nomor rekening", false),
    signerName: invoiceText_(payload.signerName, 150, "Nama penanda tangan", false)
  };
}

function invoiceHeaderValues_(data, invoiceId, createdAt, updatedAt) {
  return [
    invoiceId, data.invoiceNumber, data.invoiceDate, data.noteNumber,
    data.recipientName, data.recipientAddress, data.recipientPhone,
    data.totalQty, data.subtotalGross, data.dpp, data.ppnDeduction,
    data.pphEnabled, data.pphRate, data.pphDeduction, data.totalPayable,
    data.bank, data.accountName, data.accountNumber, data.signerName,
    "DRAFT", createdAt, updatedAt
  ];
}

function invoiceObjectFromRow_(row, map) {
  const get = function (key) { return row[map[key]]; };
  return {
    invoiceId: String(get("invoice_id")),
    invoiceNumber: String(get("invoice_number")),
    invoiceDate: String(get("invoice_date")),
    noteNumber: String(get("note_number") || ""),
    recipientName: String(get("recipient_name") || ""),
    recipientAddress: String(get("recipient_address") || ""),
    recipientPhone: String(get("recipient_phone") || ""),
    totalQty: Number(get("total_qty") || 0),
    subtotalGross: Number(get("subtotal_gross") || 0),
    dpp: Number(get("dpp") || 0),
    ppnDeduction: Number(get("ppn_deduction") || 0),
    pphEnabled: get("pph_enabled") === true || String(get("pph_enabled")) === "TRUE",
    pphRate: Number(get("pph_rate") || 0),
    pphDeduction: Number(get("pph_deduction") || 0),
    totalPayable: Number(get("total_payable") || 0),
    bank: String(get("bank") || ""),
    accountName: String(get("account_name") || ""),
    accountNumber: String(get("account_number") || ""),
    signerName: String(get("signer_name") || ""),
    status: String(get("status") || ""),
    createdAt: get("created_at"),
    updatedAt: get("updated_at")
  };
}

function invoiceReadItems_(sheet, invoiceId) {
  if (sheet.getLastRow() < 2) return [];
  const map = invoiceHeaderMap_(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return values.filter(function (row) {
    return String(row[map.invoice_id]) === String(invoiceId);
  }).map(function (row) {
    return {
      itemId: String(row[map.item_id]),
      lineNo: Number(row[map.line_no]),
      name: String(row[map.item_name] || ""),
      qty: Number(row[map.qty] || 0),
      unit: String(row[map.unit] || ""),
      price: Number(row[map.unit_price_including_tax] || 0),
      amount: Number(row[map.line_total] || 0)
    };
  }).sort(function (a, b) { return a.lineNo - b.lineNo; });
}

function saveInvoice(payload) {
  const data = invoiceBuildPayload_(payload);
  return invoiceWithLock_(function () {
    const sheets = invoiceGetSheets_();
    const invoiceSheet = sheets.invoices;
    const now = new Date();
    const row = data.invoiceId
      ? invoiceFindRow_(invoiceSheet, "invoice_id", data.invoiceId)
      : -1;
    if (data.invoiceId && row < 0) throw new Error("Invoice yang akan diperbarui tidak ditemukan.");

    const duplicateNumberRow = invoiceFindRow_(invoiceSheet, "invoice_number", data.invoiceNumber);
    if (duplicateNumberRow > 0 && duplicateNumberRow !== row) {
      throw new Error("Nomor invoice sudah digunakan.");
    }

    const invoiceId = row > 0 ? data.invoiceId : Utilities.getUuid();
    const createdAt = row > 0
      ? invoiceSheet.getRange(row, 21).getValue()
      : now;
    const targetRow = row > 0 ? row : invoiceSheet.getLastRow() + 1;

    invoiceSheet.getRange(targetRow, 1, 1, INV_SHEET_HEADERS.invoices.length)
      .setValues([invoiceHeaderValues_(data, invoiceId, createdAt || now, now)]);

    // Replace child rows for this invoice while holding the script lock.
    const itemSheet = sheets.items;
    const itemMap = invoiceHeaderMap_(itemSheet);
    for (let itemRow = itemSheet.getLastRow(); itemRow >= 2; itemRow -= 1) {
      if (String(itemSheet.getRange(itemRow, itemMap.invoice_id + 1).getValue()) === invoiceId) {
        itemSheet.deleteRow(itemRow);
      }
    }
    const itemValues = data.items.map(function (item, index) {
      return [
        Utilities.getUuid(), invoiceId, index + 1, item.name,
        item.qty, item.unit, item.price, item.amount
      ];
    });
    if (itemValues.length) {
      itemSheet.getRange(itemSheet.getLastRow() + 1, 1, itemValues.length, INV_SHEET_HEADERS.items.length)
        .setValues(itemValues);
    }

    return {
      ok: true,
      invoiceId: invoiceId,
      invoiceNumber: data.invoiceNumber,
      status: "DRAFT",
      totals: {
        totalQty: data.totalQty,
        subtotalGross: data.subtotalGross,
        dpp: data.dpp,
        ppnDeduction: data.ppnDeduction,
        pphDeduction: data.pphDeduction,
        totalPayable: data.totalPayable
      },
      updatedAt: now
    };
  });
}

function getInvoice(invoiceId) {
  const id = invoiceText_(invoiceId, 80, "ID invoice", true);
  const sheets = invoiceGetSheets_();
  const rowNumber = invoiceFindRow_(sheets.invoices, "invoice_id", id);
  if (rowNumber < 0) return null;
  const values = sheets.invoices.getRange(rowNumber, 1, 1, sheets.invoices.getLastColumn()).getValues()[0];
  const invoice = invoiceObjectFromRow_(values, invoiceHeaderMap_(sheets.invoices));
  invoice.items = invoiceReadItems_(sheets.items, id);
  return invoice;
}

function listInvoices(searchText, limit) {
  const sheets = invoiceGetSheets_();
  const sheet = sheets.invoices;
  if (sheet.getLastRow() < 2) return [];
  const query = String(searchText || "").trim().toLowerCase();
  const max = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const map = invoiceHeaderMap_(sheet);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues()
    .map(function (row) { return invoiceObjectFromRow_(row, map); })
    .filter(function (invoice) {
      return !query || [
        invoice.invoiceNumber, invoice.noteNumber, invoice.recipientName, invoice.recipientPhone
      ].join(" ").toLowerCase().indexOf(query) >= 0;
    })
    .sort(function (a, b) {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })
    .slice(0, max)
    .map(function (invoice) {
      delete invoice.recipientAddress;
      delete invoice.items;
      return invoice;
    });
}
