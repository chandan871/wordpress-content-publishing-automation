const SHEET_NAME = "Content Queue";
const FALLBACK_SPREADSHEET_ID = "1PHZafOh4R1bkXrHOKiFQ4bxMueglX_DETx-8UNOnrm8";

const REQUIRED_COLUMNS = [
  "ID",
  "Title",
  "Story",
  "Status",
  "Category",
  "Tags",
  "SEO Title",
  "Meta Description",
  "Slug",
  "WordPress URL",
  "Error Log",
];

const OPTIONAL_COLUMNS = [
  "WordPress Post ID",
  "Published Date",
  "Last Updated",
];

function doPost(e) {
  const expectedSecret = PropertiesService.getScriptProperties().getProperty("KW_SHEET_WEBHOOK_SECRET");
  const payload = JSON.parse((e.postData && e.postData.contents) || "{}");

  if (!expectedSecret || payload.secret !== expectedSecret) {
    return jsonResponse({ ok: false, error: "Unauthorized" });
  }

  const spreadsheetId =
    PropertiesService.getScriptProperties().getProperty("KW_GOOGLE_SHEET_ID") ||
    FALLBACK_SPREADSHEET_ID;
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(SHEET_NAME);
  if (!sheet) return jsonResponse({ ok: false, error: `Missing sheet: ${SHEET_NAME}` });

  const headerMap = getHeaderMap(sheet);
  for (const column of REQUIRED_COLUMNS) {
    if (!headerMap[normalizeHeader(column)]) {
      return jsonResponse({ ok: false, error: `Missing column: ${column}` });
    }
  }

  for (const column of OPTIONAL_COLUMNS) {
    ensureColumn(sheet, headerMap, column);
  }

  const values = sheet.getDataRange().getValues();
  const idCol = headerMap[normalizeHeader("ID")];
  const rowById = new Map();
  for (let row = 2; row <= values.length; row += 1) {
    const id = String(values[row - 1][idCol - 1] || "").trim();
    if (id) rowById.set(id, row);
  }

  const writableColumns = [
    "Status",
    "SEO Title",
    "Meta Description",
    "Slug",
    "WordPress URL",
    "Error Log",
    "WordPress Post ID",
    "Published Date",
    "Last Updated",
  ];

  const updated = [];
  for (const update of payload.updates || []) {
    const id = String(update.id || update.ID || "").trim();
    const row = rowById.get(id);
    if (!row) continue;

    for (const column of writableColumns) {
      if (Object.prototype.hasOwnProperty.call(update, column)) {
        sheet.getRange(row, headerMap[normalizeHeader(column)]).setValue(update[column]);
      }
    }
    updated.push(id);
  }

  return jsonResponse({ ok: true, updated });
}

function getHeaderMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const map = {};
  headers.forEach((header, index) => {
    map[normalizeHeader(header)] = index + 1;
  });
  return map;
}

function ensureColumn(sheet, headerMap, column) {
  const key = normalizeHeader(column);
  if (headerMap[key]) return;
  const nextColumn = sheet.getLastColumn() + 1;
  sheet.getRange(1, nextColumn).setValue(column);
  headerMap[key] = nextColumn;
}

function normalizeHeader(header) {
  return String(header || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
