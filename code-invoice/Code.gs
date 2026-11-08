/**
 * Invoice storage backend for a dedicated Apps Script project.
 *
 * Public web-app API:
 *   GET  ?action=health|listInvoices|getInvoice
 *   POST {"action":"saveInvoice", ...payload}
 *
 * Keep this project separate from the SID Retail Apps Script. The static frontend
 * uses direct fetch; deployment access and data authorization must be reviewed
 * before exposing the web app to users.
 */

const INV_SPREADSHEET_PROPERTY = "INVOICE_SPREADSHEET_ID";
const INV_PPH_RATE = 0.015;
const INV_VAT_INCLUDED_RATE = 0.11;
const INV_ALLOWED_PARENT_ORIGIN = "https://admin.tbnusantara.com";
const INV_BUILD_TAG = "2026-11-08-bonus-tukang-v1";

/** JSON API for the standalone Invoice frontend. GET is read-only; POST saves drafts. */
function doGet(e) {
  // Keep the old HTML bridge route temporarily available for rollback.
  if (e && e.parameter && e.parameter.mode === "bridge") {
    const nonce = String(e.parameter.nonce || "");
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(nonce)) {
      throw new Error("Nonce bridge tidak valid.");
    }
    const template = HtmlService.createTemplateFromFile("Bridge");
    template.allowedOrigin = INV_ALLOWED_PARENT_ORIGIN;
    template.bridgeNonce = nonce;
    return template.evaluate()
      .setTitle("Invoice Storage Bridge")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || "health");
  if (action === "health") return invoiceHealthResponse_();

  try {
    if (action === "listInvoices") {
      return invoiceApiSuccess_(listInvoices(params.searchText || "", params.limit));
    }
    if (action === "getInvoice") {
      return invoiceApiSuccess_(getInvoice(params.invoiceId || ""));
    }
    if (action === "listNipponPrices") {
      return invoiceApiSuccess_(listNipponPrices(params.searchText || "", params.limit));
    }
    if (action === "listBonusPeriods") {
      return invoiceApiSuccess_(listBonusPeriods());
    }
    if (action === "getBonusDashboard") {
      return invoiceApiSuccess_(getBonusDashboard(params.periodId || ""));
    }
    throw new Error("Action GET tidak dikenal: " + action);
  } catch (error) {
    return invoiceApiError_(error);
  }
}

/** Accept the WiFi repo's simple text/plain JSON POST pattern. */
function doPost(e) {
  try {
    const body = JSON.parse(e && e.postData && e.postData.contents || "{}");
    const action = String(body.action || "");
    if (action === "saveInvoice") {
      return invoiceApiSuccess_(saveInvoice(body));
    }
    if (action === "saveNipponPrice") {
      return invoiceApiSuccess_(saveNipponPrice(body));
    }
    if (action === "saveBonusWorker") return invoiceApiSuccess_(saveBonusWorker(body));
    if (action === "saveBonusProject") return invoiceApiSuccess_(saveBonusProject(body));
    if (action === "saveBonusNote") return invoiceApiSuccess_(saveBonusNote(body));
    if (action === "saveBonusPayment") return invoiceApiSuccess_(saveBonusPayment(body));
    if (action === "saveBonusPeriod") return invoiceApiSuccess_(saveBonusPeriod(body));
    if (action === "payBonusWorker") return invoiceApiSuccess_(payBonusWorker(body));
    throw new Error("Action POST tidak dikenal: " + action);
  } catch (error) {
    return invoiceApiError_(error);
  }
}

function invoiceJsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function invoiceApiSuccess_(data) {
  return invoiceJsonResponse_({ success: true, data: data });
}

function invoiceApiError_(error) {
  return invoiceJsonResponse_({
    success: false,
    message: error && error.message ? error.message : String(error)
  });
}

function invoiceHealthResponse_() {
  let storageReady = false;
  let bridgeTemplateReady = false;
  let bridgeUsesTopMessaging = false;
  let nipponPriceListReady = false;
  let bonusTukangReady = false;
  try {
    invoiceGetSheets_();
    storageReady = true;
  } catch (error) {
    storageReady = false;
  }
  try {
    invoiceGetNipponPriceSheet_();
    nipponPriceListReady = true;
  } catch (error) {
    nipponPriceListReady = false;
  }
  try {
    bonusTukangSheets_();
    bonusTukangReady = true;
  } catch (error) {
    bonusTukangReady = false;
  }
  try {
    const template = HtmlService.createTemplateFromFile("Bridge");
    template.allowedOrigin = INV_ALLOWED_PARENT_ORIGIN;
    template.bridgeNonce = "healthchecknonce123456";
    const rawBridge = template.getRawContent();
    bridgeUsesTopMessaging = rawBridge.indexOf("window.top.postMessage") >= 0;
    template.evaluate();
    bridgeTemplateReady = true;
  } catch (error) {
    bridgeTemplateReady = false;
  }

  return invoiceJsonResponse_({
    status: "ok",
    service: "invoice-storage",
    version: "v1",
    build: INV_BUILD_TAG,
    allowedParentOrigin: INV_ALLOWED_PARENT_ORIGIN,
    storageReady: storageReady,
    bridgeTemplateReady: bridgeTemplateReady,
    bridgeUsesTopMessaging: bridgeUsesTopMessaging,
    priceListReady: nipponPriceListReady,
    bonusTukangReady: bonusTukangReady,
    api: {
      get: ["health", "listInvoices", "getInvoice", "listNipponPrices", "listBonusPeriods", "getBonusDashboard"],
      post: ["saveInvoice", "saveNipponPrice", "saveBonusWorker", "saveBonusProject", "saveBonusNote", "saveBonusPayment", "saveBonusPeriod", "payBonusWorker"]
    },
    message: "Health check tidak membaca isi invoice dan tidak mengubah data."
  });
}

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
    const normalizedPrice = Math.round(price);
    const amount = Math.round(qty * normalizedPrice);
    if (!Number.isSafeInteger(amount)) throw new Error("Jumlah barang terlalu besar.");
    return { name: name, qty: qty, unit: unit, price: normalizedPrice, amount: amount };
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

function invoiceDateTimeIso_(value) {
  return value instanceof Date ? value.toISOString() : String(value || "");
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
    createdAt: invoiceDateTimeIso_(get("created_at")),
    updatedAt: invoiceDateTimeIso_(get("updated_at"))
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
      updatedAt: now.toISOString()
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


/* Nippon Paint purchase price list: separate sheet and actions, same Invoice GAS. */
function invoiceGetNipponPriceSheet_() {
  const spreadsheet = invoiceGetSpreadsheet_();
  const sheet = spreadsheet.getSheetByName("NipponPriceList");
  if (!sheet) {
    throw new Error("Sheet NipponPriceList belum tersedia. Jalankan setupNipponPriceListSheet().");
  }
  if (!sheet.getLastRow()) {
    throw new Error("Sheet NipponPriceList belum memiliki header. Jalankan setupNipponPriceListSheet().");
  }
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), NIPPON_PRICE_HEADERS.length))
    .getDisplayValues()[0]
    .slice(0, NIPPON_PRICE_HEADERS.length);
  if (NIPPON_PRICE_HEADERS.some(function (header, index) { return headers[index] !== header; })) {
    throw new Error("Header NipponPriceList tidak sesuai dengan skema aplikasi.");
  }
  return sheet;
}

function nipponPriceText_(value, label, maxLength) {
  const text = String(value == null ? "" : value).trim();
  if (!text) throw new Error(label + " wajib diisi.");
  if (text.length > maxLength) throw new Error(label + " maksimal " + maxLength + " karakter.");
  return text;
}

function nipponPriceMoney_(value) {
  if (typeof value === "string" && !value.trim()) throw new Error("HPP dasar wajib diisi.");
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > Number.MAX_SAFE_INTEGER) {
    throw new Error("HPP dasar harus berupa angka lebih besar dari 0.");
  }
  return Math.round(amount);
}

function nipponPriceMapRow_(row, map) {
  return {
    priceId: String(row[map.price_id] || ""),
    productName: String(row[map.product_name] || ""),
    size: String(row[map.size] || ""),
    baseCost: Number(row[map.base_cost] || 0),
    active: row[map.active] !== false,
    createdAt: row[map.created_at] || "",
    updatedAt: row[map.updated_at] || ""
  };
}

function listNipponPrices(searchText, limit) {
  const sheet = invoiceGetNipponPriceSheet_();
  if (sheet.getLastRow() < 2) return [];
  const map = invoiceHeaderMap_(sheet);
  const query = String(searchText || "").trim().toLocaleLowerCase("id-ID");
  const max = Math.min(Math.max(Number(limit) || 200, 1), 500);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
    .getValues()
    .map(function (row) { return nipponPriceMapRow_(row, map); })
    .filter(function (product) {
      return product.active && (!query ||
        (product.productName + " " + product.size).toLocaleLowerCase("id-ID").indexOf(query) >= 0);
    })
    .sort(function (a, b) {
      return a.productName.localeCompare(b.productName, "id") || a.size.localeCompare(b.size, "id");
    })
    .slice(0, max);
}

function saveNipponPrice(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Data produk Nippon Paint tidak valid.");
  }
  const productName = nipponPriceText_(payload.productName, "Nama barang", 180);
  const size = nipponPriceText_(payload.size, "Ukuran/kemasan", 80);
  const baseCost = nipponPriceMoney_(payload.baseCost);
  const priceId = String(payload.priceId || "").trim();

  return invoiceWithLock_(function () {
    const sheet = invoiceGetNipponPriceSheet_();
    const map = invoiceHeaderMap_(sheet);
    const now = new Date();
    const rows = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues()
      : [];
    let targetRow = -1;
    let createdAt = now;

    rows.forEach(function (row, index) {
      const existingId = String(row[map.price_id] || "");
      if (priceId && existingId === priceId) {
        targetRow = index + 2;
        createdAt = row[map.created_at] || now;
      }
      const sameProduct = String(row[map.product_name] || "").trim().toLocaleLowerCase("id-ID") === productName.toLocaleLowerCase("id-ID");
      const sameSize = String(row[map.size] || "").trim().toLocaleLowerCase("id-ID") === size.toLocaleLowerCase("id-ID");
      if (row[map.active] !== false && sameProduct && sameSize && (!priceId || existingId !== priceId)) {
        throw new Error("Produk dengan nama dan ukuran yang sama sudah terdaftar.");
      }
    });

    if (priceId && targetRow < 0) throw new Error("Data produk Nippon Paint tidak ditemukan.");
    const id = priceId || ("NPP-" + Utilities.getUuid());
    const values = [id, productName, size, baseCost, true, createdAt, now];
    if (targetRow > 0) {
      sheet.getRange(targetRow, 1, 1, values.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }
    const savedRow = targetRow > 0 ? targetRow : sheet.getLastRow();
    sheet.getRange(savedRow, 4).setNumberFormat("#,##0");
    sheet.getRange(savedRow, 6, 1, 2).setNumberFormat("yyyy-mm-dd hh:mm:ss");
    return {
      priceId: id,
      productName: productName,
      size: size,
      baseCost: baseCost,
      active: true,
      createdAt: createdAt,
      updatedAt: now
    };
  });
}


/* Bonus Tukang: manual sale/payment register stored in dedicated tabs. */
function bonusTukangSheets_() {
  const spreadsheet = invoiceGetSpreadsheet_();
  const names = {
    workers: "BonusTukang",
    projects: "BonusProyek",
    notes: "BonusNota",
    payments: "BonusPembayaran",
    periods: "BonusPeriode",
    realizations: "BonusRealisasi"
  };
  const result = {};
  Object.keys(names).forEach(function (key) {
    const sheet = spreadsheet.getSheetByName(names[key]);
    const headers = BONUS_SHEET_HEADERS[key];
    if (!sheet || !headers || sheet.getLastRow() < 1) {
      throw new Error("Tab " + names[key] + " belum siap. Jalankan setupBonusTukangSheets().");
    }
    const actual = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length))
      .getDisplayValues()[0].slice(0, headers.length);
    if (headers.some(function (header, index) { return actual[index] !== header; })) {
      throw new Error("Header tab " + names[key] + " tidak sesuai.");
    }
    result[key] = sheet;
  });
  return result;
}

function bonusRows_(key, sheet) {
  const target = sheet || bonusTukangSheets_()[key];
  if (target.getLastRow() < 2) return [];
  const map = invoiceHeaderMap_(target);
  return target.getRange(2, 1, target.getLastRow() - 1, target.getLastColumn())
    .getValues()
    .map(function (values, index) {
      const item = {};
      Object.keys(map).forEach(function (header) { item[header] = values[map[header]]; });
      item._row = index + 2;
      return item;
    });
}

function bonusText_(value, label, maxLength, required) {
  const text = String(value == null ? "" : value).trim();
  if (required && !text) throw new Error(label + " wajib diisi.");
  if (text.length > maxLength) throw new Error(label + " maksimal " + maxLength + " karakter.");
  return text;
}

function bonusMoney_(value, label, allowZero) {
  if (typeof value === "string" && !value.trim()) {
    if (allowZero) return 0;
    throw new Error(label + " wajib diisi.");
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0) || amount > Number.MAX_SAFE_INTEGER) {
    throw new Error(label + " tidak valid.");
  }
  return Math.round(amount);
}

function bonusDate_(value, label) {
  const text = bonusText_(value, label, 10, true);
  const date = new Date(text + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== text) {
    throw new Error(label + " harus memakai tanggal valid YYYY-MM-DD.");
  }
  return text;
}

function bonusId_(prefix) {
  return prefix + "-" + Utilities.getUuid();
}

function bonusFindById_(rows, idField, id) {
  return rows.find(function (row) { return String(row[idField] || "") === String(id || ""); }) || null;
}

function bonusPeriodOutput_(row) {
  return {
    periodId: String(row.period_id || ""),
    eidYear: Number(row.eid_year || 0),
    eidDate: bonusIsoDate_(row.eid_date),
    payoutDaysBefore: Number(row.payout_days_before || 7),
    payoutDate: bonusIsoDate_(row.payout_date),
    bonusRatePercent: Number(row.bonus_rate_percent || 1),
    status: String(row.status || "OPEN"),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function bonusIsoDate_(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "UTC", "yyyy-MM-dd");
  }
  return String(value).slice(0, 10);
}

function bonusPayoutDate_(eidDate, daysBefore) {
  const date = new Date(eidDate + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - daysBefore);
  return date.toISOString().slice(0, 10);
}

function listBonusPeriods() {
  return bonusRows_("periods")
    .map(bonusPeriodOutput_)
    .sort(function (a, b) { return b.eidYear - a.eidYear; });
}

function bonusBuildDashboard_(period) {
  const sheets = bonusTukangSheets_();
  const workers = bonusRows_("workers", sheets.workers)
    .filter(function (row) { return row.active !== false; })
    .map(function (row) {
      return {
        workerId: String(row.worker_id || ""),
        name: String(row.name || ""),
        address: String(row.address || ""),
        phone: String(row.phone || ""),
        active: row.active !== false,
        createdAt: row.created_at || "",
        updatedAt: row.updated_at || "",
        projects: [],
        totalPurchase: 0,
        totalPaid: 0,
        outstanding: 0,
        bonusBasisPurchase: 0,
        bonusOutstanding: 0,
        eligibleBonus: 0,
        pendingBonusEstimate: 0
      };
    });
  const workerMap = {};
  workers.forEach(function (worker) { workerMap[worker.workerId] = worker; });

  const projects = bonusRows_("projects", sheets.projects)
    .filter(function (row) { return row.active !== false && workerMap[String(row.worker_id || "")]; })
    .map(function (row) {
      return {
        projectId: String(row.project_id || ""),
        workerId: String(row.worker_id || ""),
        customerName: String(row.customer_name || ""),
        customerCode: String(row.customer_code || ""),
        projectName: String(row.project_name || ""),
        notes: [],
        unallocatedNotes: [],
        totalPurchase: 0,
        totalPaid: 0,
        outstanding: 0,
        bonusBasisPurchase: 0,
        bonusBasisPaid: 0,
        bonusOutstanding: 0,
        eligibleBonus: 0,
        pendingBonusEstimate: 0,
        status: "NO_NOTES"
      };
    });
  const projectMap = {};
  projects.forEach(function (project) {
    projectMap[project.projectId] = project;
    workerMap[project.workerId].projects.push(project);
  });

  const allNotes = bonusRows_("notes", sheets.notes);
  const payments = bonusRows_("payments", sheets.payments);
  const paidByNote = {};
  const paymentsByNote = {};
  payments.forEach(function (payment) {
    const noteId = String(payment.note_id || "");
    paidByNote[noteId] = (paidByNote[noteId] || 0) + Number(payment.amount || 0);
    if (!paymentsByNote[noteId]) paymentsByNote[noteId] = [];
    paymentsByNote[noteId].push({
      paymentId: String(payment.payment_id || ""),
      paymentDate: bonusIsoDate_(payment.payment_date),
      amount: Number(payment.amount || 0),
      reference: String(payment.reference || "")
    });
  });

  allNotes.forEach(function (row) {
    const project = projectMap[String(row.project_id || "")];
    if (!project) return;
    const noteId = String(row.note_id || "");
    const total = Number(row.total_purchase || 0);
    const paid = paidByNote[noteId] || 0;
    const outstanding = Math.max(0, total - paid);
    const note = {
      noteId: noteId,
      noteNumber: String(row.note_number || ""),
      noteDate: bonusIsoDate_(row.note_date),
      totalPurchase: total,
      totalPaid: paid,
      outstanding: outstanding,
      bonusRealizationId: String(row.bonus_realization_id || ""),
      payments: paymentsByNote[noteId] || [],
      _row: row._row
    };
    project.notes.push(note);
    project.totalPurchase += total;
    project.totalPaid += paid;
    project.outstanding += outstanding;
    if (!note.bonusRealizationId) {
      project.unallocatedNotes.push(note);
      project.bonusBasisPurchase += total;
      project.bonusBasisPaid += paid;
      project.bonusOutstanding += outstanding;
    }
  });

  const rate = period && period.status === "OPEN" ? Number(period.bonus_rate_percent || 0) : 0;
  projects.forEach(function (project) {
    project.status = !project.unallocatedNotes.length
      ? "NO_NOTES"
      : project.bonusOutstanding === 0
        ? "ELIGIBLE"
        : "PENDING";
    const estimate = Math.round(project.bonusBasisPurchase * rate / 100);
    if (project.status === "ELIGIBLE") project.eligibleBonus = estimate;
    if (project.status === "PENDING") project.pendingBonusEstimate = estimate;
  });
  workers.forEach(function (worker) {
    worker.totalPurchase = worker.projects.reduce(function (sum, project) { return sum + project.totalPurchase; }, 0);
    worker.totalPaid = worker.projects.reduce(function (sum, project) { return sum + project.totalPaid; }, 0);
    worker.outstanding = worker.projects.reduce(function (sum, project) { return sum + project.outstanding; }, 0);
    worker.bonusBasisPurchase = worker.projects.reduce(function (sum, project) { return sum + project.bonusBasisPurchase; }, 0);
    worker.bonusOutstanding = worker.projects.reduce(function (sum, project) { return sum + project.bonusOutstanding; }, 0);
    worker.eligibleBonus = worker.projects.reduce(function (sum, project) { return sum + project.eligibleBonus; }, 0);
    worker.pendingBonusEstimate = worker.projects.reduce(function (sum, project) { return sum + project.pendingBonusEstimate; }, 0);
    worker.projects.sort(function (a, b) { return a.customerName.localeCompare(b.customerName, "id"); });
  });

  return {
    period: period ? bonusPeriodOutput_(period) : null,
    workers: workers,
    projects: projects,
    summary: {
      workerCount: workers.length,
      projectCount: projects.length,
      eligibleBonus: workers.reduce(function (sum, worker) { return sum + worker.eligibleBonus; }, 0),
      pendingBonusEstimate: workers.reduce(function (sum, worker) { return sum + worker.pendingBonusEstimate; }, 0),
      outstanding: workers.reduce(function (sum, worker) { return sum + worker.outstanding; }, 0)
    }
  };
}

function getBonusDashboard(periodId) {
  const periods = bonusRows_("periods");
  let selected = bonusFindById_(periods, "period_id", periodId);
  if (!selected) {
    const open = periods.filter(function (row) { return String(row.status || "") === "OPEN"; })
      .sort(function (a, b) { return Number(b.eid_year || 0) - Number(a.eid_year || 0); });
    selected = open[0] || periods.sort(function (a, b) { return Number(b.eid_year || 0) - Number(a.eid_year || 0); })[0] || null;
  }
  return bonusBuildDashboard_(selected);
}

function saveBonusWorker(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Data tukang tidak valid.");
  const workerId = String(payload.workerId || "").trim();
  const name = bonusText_(payload.name, "Nama tukang", 180, true);
  const address = bonusText_(payload.address, "Alamat", 500, false);
  const phone = bonusText_(payload.phone, "Nomor HP", 40, false);
  return invoiceWithLock_(function () {
    const sheet = bonusTukangSheets_().workers;
    const map = invoiceHeaderMap_(sheet);
    const rows = bonusRows_("workers", sheet);
    const existing = workerId ? bonusFindById_(rows, "worker_id", workerId) : null;
    if (workerId && !existing) throw new Error("Data tukang tidak ditemukan.");
    const now = new Date();
    const id = workerId || bonusId_("TUK");
    const values = [id, name, address, phone, true, existing ? existing.created_at : now, now];
    if (existing) sheet.getRange(existing._row, 1, 1, values.length).setValues([values]);
    else sheet.appendRow(values);
    return { workerId: id, name: name, address: address, phone: phone, active: true };
  });
}

function saveBonusProject(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Data proyek tidak valid.");
  const projectId = String(payload.projectId || "").trim();
  const workerId = bonusText_(payload.workerId, "Tukang", 100, true);
  const customerName = bonusText_(payload.customerName, "Nama konsumen", 180, true);
  const customerCode = bonusText_(payload.customerCode, "Kode konsumen", 80, false);
  const projectName = bonusText_(payload.projectName, "Nama proyek", 180, false);
  return invoiceWithLock_(function () {
    const sheets = bonusTukangSheets_();
    const workers = bonusRows_("workers", sheets.workers);
    const worker = bonusFindById_(workers, "worker_id", workerId);
    if (!worker || worker.active === false) throw new Error("Tukang aktif tidak ditemukan.");
    const sheet = sheets.projects, map = invoiceHeaderMap_(sheet), rows = bonusRows_("projects", sheet);
    const existing = projectId ? bonusFindById_(rows, "project_id", projectId) : null;
    if (projectId && !existing) throw new Error("Proyek tidak ditemukan.");
    if (existing && String(existing.worker_id) !== workerId) {
      const linkedNotes = bonusRows_("notes", sheets.notes).some(function (note) { return String(note.project_id) === projectId; });
      if (linkedNotes) throw new Error("Tukang proyek tidak dapat diganti setelah nota dicatat.");
    }
    const duplicate = rows.find(function (row) {
      return row.active !== false &&
        String(row.worker_id) === workerId &&
        String(row.customer_name).toLowerCase() === customerName.toLowerCase() &&
        String(row.project_name || "").toLowerCase() === projectName.toLowerCase() &&
        String(row.project_id) !== projectId;
    });
    if (duplicate) throw new Error("Konsumen/proyek ini sudah tercatat untuk tukang tersebut.");
    const now = new Date(), id = projectId || bonusId_("PRJ");
    const values = [id, workerId, customerName, customerCode, projectName, true, existing ? existing.created_at : now, now];
    if (existing) sheet.getRange(existing._row, 1, 1, values.length).setValues([values]);
    else sheet.appendRow(values);
    return { projectId: id, workerId: workerId, customerName: customerName, customerCode: customerCode, projectName: projectName, active: true };
  });
}

function saveBonusNote(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Data nota tidak valid.");
  const noteId = String(payload.noteId || "").trim();
  const projectId = bonusText_(payload.projectId, "Proyek", 100, true);
  const noteNumber = bonusText_(payload.noteNumber, "Nomor nota", 100, true);
  const noteDate = bonusDate_(payload.noteDate, "Tanggal nota");
  const totalPurchase = bonusMoney_(payload.totalPurchase, "Total belanja", false);
  return invoiceWithLock_(function () {
    const sheets = bonusTukangSheets_(), projectRows = bonusRows_("projects", sheets.projects);
    if (!bonusFindById_(projectRows, "project_id", projectId)) throw new Error("Konsumen/proyek tidak ditemukan.");
    const sheet = sheets.notes, rows = bonusRows_("notes", sheet);
    const existing = noteId ? bonusFindById_(rows, "note_id", noteId) : null;
    if (noteId && !existing) throw new Error("Nota tidak ditemukan.");
    if (existing && String(existing.bonus_realization_id || "").trim()) {
      throw new Error("Nota sudah masuk realisasi bonus dan tidak dapat diedit.");
    }
    const duplicate = rows.find(function (row) {
      return String(row.note_number || "").toLowerCase() === noteNumber.toLowerCase() && String(row.note_id) !== noteId;
    });
    if (duplicate) throw new Error("Nomor nota sudah pernah dicatat.");
    if (existing) {
      const oldPaid = bonusRows_("payments", sheets.payments)
        .filter(function (payment) { return String(payment.note_id) === noteId; })
        .reduce(function (sum, payment) { return sum + Number(payment.amount || 0); }, 0);
      if (totalPurchase < oldPaid) throw new Error("Total nota tidak boleh kurang dari pembayaran yang sudah dicatat.");
    }
    const now = new Date(), id = noteId || bonusId_("NOT");
    const values = [id, projectId, noteNumber, noteDate, totalPurchase, existing ? existing.bonus_realization_id : "", existing ? existing.created_at : now, now];
    if (existing) sheet.getRange(existing._row, 1, 1, values.length).setValues([values]);
    else sheet.appendRow(values);
    return { noteId: id, projectId: projectId, noteNumber: noteNumber, noteDate: noteDate, totalPurchase: totalPurchase };
  });
}

function saveBonusPayment(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Data pembayaran tidak valid.");
  const noteId = bonusText_(payload.noteId, "Nota", 100, true);
  const paymentDate = bonusDate_(payload.paymentDate, "Tanggal pembayaran");
  const amount = bonusMoney_(payload.amount, "Jumlah pembayaran", false);
  const reference = bonusText_(payload.reference, "Referensi pembayaran", 180, false);
  return invoiceWithLock_(function () {
    const sheets = bonusTukangSheets_();
    const note = bonusFindById_(bonusRows_("notes", sheets.notes), "note_id", noteId);
    if (!note) throw new Error("Nota tidak ditemukan.");
    if (String(note.bonus_realization_id || "").trim()) throw new Error("Nota sudah menerima realisasi bonus.");
    const paid = bonusRows_("payments", sheets.payments)
      .filter(function (row) { return String(row.note_id) === noteId; })
      .reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
    if (paid + amount > Number(note.total_purchase || 0)) {
      throw new Error("Pembayaran melebihi sisa nota sebesar " + Math.max(0, Number(note.total_purchase || 0) - paid) + ".");
    }
    const id = bonusId_("BYR"), now = new Date();
    sheets.payments.appendRow([id, noteId, paymentDate, amount, reference, now]);
    return { paymentId: id, noteId: noteId, paymentDate: paymentDate, amount: amount, reference: reference };
  });
}

function saveBonusPeriod(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Data periode tidak valid.");
  const year = Number(payload.eidYear);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error("Tahun Lebaran tidak valid.");
  const eidDate = bonusDate_(payload.eidDate, "Tanggal Lebaran");
  if (Number(eidDate.slice(0, 4)) !== year) throw new Error("Tahun tanggal Lebaran harus sama dengan tahun periode.");
  const days = Number(payload.payoutDaysBefore);
  if (days !== 7 && days !== 10) throw new Error("Pembagian bonus dipilih 7 atau 10 hari sebelum Lebaran.");
  const rate = Number(payload.bonusRatePercent);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) throw new Error("Persentase bonus harus lebih dari 0 dan maksimal 100.");
  const payoutDate = bonusPayoutDate_(eidDate, days);
  return invoiceWithLock_(function () {
    const sheets = bonusTukangSheets_(), sheet = sheets.periods, rows = bonusRows_("periods", sheet);
    const existing = rows.find(function (row) { return Number(row.eid_year) === year; }) || null;
    const latestYear = rows.reduce(function (max, row) { return Math.max(max, Number(row.eid_year) || 0); }, 0);
    if (!existing && year < latestYear) throw new Error("Periode baru harus lebih baru dari periode yang sudah tersimpan.");
    if (existing && String(existing.status) === "CLOSED") throw new Error("Periode lama sudah ditutup dan tidak dapat dibuka kembali.");
    const id = existing ? String(existing.period_id) : ("EID-" + year);
    const realizations = bonusRows_("realizations", sheets.realizations)
      .filter(function (row) { return String(row.period_id) === id; });
    if (realizations.length && Number(existing.bonus_rate_percent) !== rate) {
      throw new Error("Tarif periode sudah dipakai dalam realisasi bonus dan tidak dapat diubah.");
    }
    rows.forEach(function (row) {
      if (String(row.period_id) !== id && String(row.status) === "OPEN" && Number(row.eid_year) < year) {
        sheet.getRange(row._row, 7).setValue("CLOSED");
        sheet.getRange(row._row, 9).setValue(new Date());
      }
    });
    const now = new Date();
    const values = [id, year, eidDate, days, payoutDate, rate, "OPEN", existing ? existing.created_at : now, now];
    if (existing) sheet.getRange(existing._row, 1, 1, values.length).setValues([values]);
    else sheet.appendRow(values);
    return bonusPeriodOutput_({
      period_id: id, eid_year: year, eid_date: eidDate, payout_days_before: days,
      payout_date: payoutDate, bonus_rate_percent: rate, status: "OPEN",
      created_at: existing ? existing.created_at : now, updated_at: now
    });
  });
}

function payBonusWorker(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Data pembayaran bonus tidak valid.");
  const periodId = bonusText_(payload.periodId, "Periode", 100, true);
  const workerId = bonusText_(payload.workerId, "Tukang", 100, true);
  const payoutDate = bonusDate_(payload.payoutDate, "Tanggal pembayaran bonus");
  const reference = bonusText_(payload.reference, "Referensi/catatan pembayaran", 180, false);

  return invoiceWithLock_(function () {
    const sheets = bonusTukangSheets_();
    const periodRow = bonusFindById_(bonusRows_("periods", sheets.periods), "period_id", periodId);
    if (!periodRow || String(periodRow.status) !== "OPEN") throw new Error("Periode bonus tidak aktif untuk pencatatan pembayaran.");
    if (payoutDate > bonusIsoDate_(periodRow.eid_date)) throw new Error("Tanggal pembayaran bonus harus sebelum atau pada tanggal Lebaran.");
    const dashboard = bonusBuildDashboard_(periodRow);
    const worker = dashboard.workers.find(function (item) { return item.workerId === workerId; });
    if (!worker) throw new Error("Tukang tidak ditemukan.");
    const eligible = worker.projects.filter(function (project) { return project.status === "ELIGIBLE"; });
    if (!eligible.length) throw new Error("Belum ada proyek dengan seluruh nota lunas dan bonus layak dibayar.");
    const noteRows = bonusRows_("notes", sheets.notes);
    const noteMap = invoiceHeaderMap_(sheets.notes);
    const now = new Date(), created = [];
    eligible.forEach(function (project) {
      const realizationId = bonusId_("RLS");
      const bonusAmount = Math.round(project.bonusBasisPurchase * Number(periodRow.bonus_rate_percent) / 100);
      sheets.realizations.appendRow([
        realizationId, periodId, workerId, project.projectId, project.bonusBasisPurchase,
        project.bonusBasisPaid, Number(periodRow.bonus_rate_percent), bonusAmount,
        payoutDate, reference, now
      ]);
      project.unallocatedNotes.forEach(function (note) {
        const original = noteRows.find(function (row) { return String(row.note_id) === note.noteId; });
        if (original) sheets.notes.getRange(original._row, noteMap.bonus_realization_id + 1).setValue(realizationId);
      });
      created.push({ realizationId: realizationId, projectId: project.projectId, bonusAmount: bonusAmount });
    });
    return {
      periodId: periodId,
      workerId: workerId,
      payoutDate: payoutDate,
      totalBonusPaid: created.reduce(function (sum, row) { return sum + row.bonusAmount; }, 0),
      realizations: created
    };
  });
}
