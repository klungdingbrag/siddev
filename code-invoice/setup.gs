/**
 * Invoice Spreadsheet bootstrap.
 * Run setupInvoiceSpreadsheet() once from the dedicated Invoice Apps Script project.
 * Set Script Property INVOICE_SPREADSHEET_ID first, or bind this project to the target
 * spreadsheet and leave the property empty. Existing non-empty headers are never replaced.
 */
const INV_SHEET_HEADERS = Object.freeze({
  invoices: [
    "invoice_id", "invoice_number", "invoice_date", "note_number",
    "recipient_name", "recipient_address", "recipient_phone",
    "total_qty", "subtotal_gross", "dpp", "ppn_deduction",
    "pph_enabled", "pph_rate", "pph_deduction", "total_payable",
    "bank", "account_name", "account_number", "signer_name",
    "status", "created_at", "updated_at"
  ],
  items: [
    "item_id", "invoice_id", "line_no", "item_name",
    "qty", "unit", "unit_price_including_tax", "line_total"
  ],
  config: ["key", "value", "updated_at"]
});

const INV_DEFAULT_CONFIG = Object.freeze([
  ["bank", "BRI"],
  ["account_name", "Wasimun"],
  ["account_number", "003201105050505"]
]);

function setupInvoiceSpreadsheet() {
  const spreadsheet = invoiceGetSpreadsheet_();
  const specs = [
    { name: "Invoices", headers: INV_SHEET_HEADERS.invoices },
    { name: "InvoiceItems", headers: INV_SHEET_HEADERS.items },
    { name: "Config", headers: INV_SHEET_HEADERS.config }
  ];

  specs.forEach(function (spec) {
    let sheet = spreadsheet.getSheetByName(spec.name);
    if (!sheet) sheet = spreadsheet.insertSheet(spec.name);

    const lastColumn = Math.max(sheet.getLastColumn(), spec.headers.length);
    const currentHeaders = sheet.getLastRow()
      ? sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].slice(0, spec.headers.length)
      : [];

    if (sheet.getLastRow() && spec.headers.some(function (header, index) {
      return currentHeaders[index] !== header;
    })) {
      throw new Error(
        "Header sheet " + spec.name + " tidak sesuai. Tidak ada data yang diubah. " +
        "Periksa baris pertama sebelum menjalankan setup kembali."
      );
    }

    if (!sheet.getLastRow()) {
      sheet.getRange(1, 1, 1, spec.headers.length).setValues([spec.headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, spec.headers.length)
        .setFontWeight("bold")
        .setBackground("#0b3f88")
        .setFontColor("#ffffff");
      sheet.autoResizeColumns(1, spec.headers.length);
    }
  });

  const configSheet = spreadsheet.getSheetByName("Config");
  if (configSheet.getLastRow() === 1) {
    const now = new Date();
    configSheet.getRange(2, 1, INV_DEFAULT_CONFIG.length, 3).setValues(
      INV_DEFAULT_CONFIG.map(function (entry) {
        return [entry[0], entry[1], now];
      })
    );
    configSheet.getRange(2, 3, INV_DEFAULT_CONFIG.length, 1)
      .setNumberFormat("yyyy-mm-dd hh:mm:ss");
  }

  const invoiceSheet = spreadsheet.getSheetByName("Invoices");
  invoiceSheet.getRange("C:C").setNumberFormat("@");
  invoiceSheet.getRange("H:H").setNumberFormat("#,##0.###");
  invoiceSheet.getRange("I:K").setNumberFormat("#,##0");
  invoiceSheet.getRange("M:M").setNumberFormat("0.0%");
  invoiceSheet.getRange("N:O").setNumberFormat("#,##0");
  invoiceSheet.getRange("U:V").setNumberFormat("yyyy-mm-dd hh:mm:ss");

  const itemSheet = spreadsheet.getSheetByName("InvoiceItems");
  itemSheet.getRange("E:E").setNumberFormat("#,##0.###");
  itemSheet.getRange("G:H").setNumberFormat("#,##0");

  return {
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    sheets: specs.map(function (spec) { return spec.name; }),
    message: "Struktur Spreadsheet Invoice siap digunakan."
  };
}


const NIPPON_PRICE_HEADERS = Object.freeze([
  "price_id", "product_name", "size", "base_cost", "active", "created_at", "updated_at"
]);

/**
 * Create only the Nippon price list tab. Does not modify Invoice sheets.
 * Run once after deploying this source to the Invoice Apps Script project.
 */
function setupNipponPriceListSheet() {
  const spreadsheet = invoiceGetSpreadsheet_();
  const name = "NipponPriceList";
  let sheet = spreadsheet.getSheetByName(name);

  if (!sheet) sheet = spreadsheet.insertSheet(name);

  if (sheet.getLastRow()) {
    const lastColumn = Math.max(sheet.getLastColumn(), NIPPON_PRICE_HEADERS.length);
    const headers = sheet.getRange(1, 1, 1, lastColumn)
      .getDisplayValues()[0]
      .slice(0, NIPPON_PRICE_HEADERS.length);
    if (NIPPON_PRICE_HEADERS.some(function (header, index) {
      return headers[index] !== header;
    })) {
      throw new Error(
        "Header sheet " + name + " tidak sesuai. Tidak ada data yang diubah. " +
        "Periksa baris pertama sebelum menjalankan setup kembali."
      );
    }
  } else {
    sheet.getRange(1, 1, 1, NIPPON_PRICE_HEADERS.length)
      .setValues([NIPPON_PRICE_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, NIPPON_PRICE_HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#0b3f88")
      .setFontColor("#ffffff");
    sheet.autoResizeColumns(1, NIPPON_PRICE_HEADERS.length);
    sheet.getRange("D:D").setNumberFormat("#,##0");
    sheet.getRange("F:G").setNumberFormat("yyyy-mm-dd hh:mm:ss");
  }

  return {
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    sheet: name,
    headers: NIPPON_PRICE_HEADERS.slice(),
    message: "Sheet NipponPriceList siap digunakan."
  };
}
