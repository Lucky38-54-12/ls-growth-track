import { google } from "googleapis";
import { JWT } from "google-auth-library";

interface SheetData {
  sheetId: string;
  sheetName: string;
  columnMap: Record<string, number>; // "email" -> column index
  rows: Record<string, string>[];
}

interface ColumnMapping {
  businessName?: number;
  email?: number;
  phone?: number;
  website?: number;
  facebook?: number;
  dateCalled?: number;
  outcome?: number;
  callBack?: number;
  notes?: number;
}

const COLUMN_ALIASES: Record<string, string[]> = {
  businessName: ["business name", "company", "company name"],
  email: ["email", "email address"],
  phone: ["phone", "phone number", "number", "mobile"],
  website: ["website", "web", "website url"],
  facebook: ["facebook", "facebook page", "fb"],
  dateCalled: ["date called", "date contacted", "contact date", "called date"],
  outcome: ["outcome", "result", "status"],
  callBack: ["call back", "callback", "follow up"],
  notes: ["notes", "note", "comments", "comment"],
};

function getServiceAccountAuth(): JWT {
  const keyString = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyString) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var not set");

  const key = JSON.parse(keyString);
  const jwtClient = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });

  return jwtClient;
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim();
}

function mapColumns(headers: string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping: ColumnMapping = {};

  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    const index = normalized.findIndex((h) =>
      aliases.some((alias) => h.includes(alias))
    );
    if (index !== -1) {
      mapping[key as keyof ColumnMapping] = index;
    }
  }

  return mapping;
}

export async function getSheetData(spreadsheetId: string, range: string): Promise<SheetData> {
  const auth = getServiceAccountAuth();
  const sheets = google.sheets({ version: "v4", auth: auth as any });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const values = response.data.values || [];
  if (values.length === 0) {
    return { sheetId: spreadsheetId, sheetName: range, columnMap: {}, rows: [] };
  }

  const headers = values[0] as string[];
  const mapping = mapColumns(headers);

  const rows = values.slice(1).map((row: any[]) => ({
    businessName: mapping.businessName !== undefined ? row[mapping.businessName] || "" : "",
    email: mapping.email !== undefined ? row[mapping.email] || "" : "",
    phone: mapping.phone !== undefined ? row[mapping.phone] || "" : "",
    website: mapping.website !== undefined ? row[mapping.website] || "" : "",
    facebook: mapping.facebook !== undefined ? row[mapping.facebook] || "" : "",
    dateCalled: mapping.dateCalled !== undefined ? row[mapping.dateCalled] || "" : "",
    outcome: mapping.outcome !== undefined ? row[mapping.outcome] || "" : "",
    callBack: mapping.callBack !== undefined ? row[mapping.callBack] || "" : "",
    notes: mapping.notes !== undefined ? row[mapping.notes] || "" : "",
  }));

  return {
    sheetId: spreadsheetId,
    sheetName: range,
    columnMap: mapping as any,
    rows,
  };
}

export async function listSheets(spreadsheetId: string): Promise<string[]> {
  const auth = getServiceAccountAuth();
  const sheets = google.sheets({ version: "v4", auth: auth as any });

  const response = await sheets.spreadsheets.get({ spreadsheetId });
  return (
    response.data.sheets
      ?.map((sheet) => sheet.properties?.title || "")
      .filter((name) => name && !name.startsWith("_")) || []
  );
}

export async function appendToSheet(
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<void> {
  const auth = getServiceAccountAuth();
  const sheets = google.sheets({ version: "v4", auth: auth as any });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

export async function updateSheetCell(
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<void> {
  const auth = getServiceAccountAuth();
  const sheets = google.sheets({ version: "v4", auth: auth as any });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

export async function getRawRange(spreadsheetId: string, range: string): Promise<string[][]> {
  const auth = getServiceAccountAuth();
  const sheets = google.sheets({ version: "v4", auth: auth as any });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values || []) as string[][];
}

// Finds the 1-based sheet row (matching readLeadSheet's A2:I layout, so row 2
// is the first data row) whose company column (A) matches — read fresh right
// before a write, never a row index computed earlier, since the sheet can
// change between when a Brain action is proposed and when it's approved.
export async function findSheetRowByCompany(spreadsheetId: string, company: string): Promise<number | null> {
  const rows = await getRawRange(spreadsheetId, "A2:A");
  const target = company.trim().toLowerCase();
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][0] || "").trim().toLowerCase() === target) return i + 2;
  }
  // Fall back to a substring match if nothing matched exactly — sheet
  // company names are hand-typed and often slightly different from how a
  // lead's name gets referenced in chat.
  for (let i = 0; i < rows.length; i++) {
    const cell = (rows[i][0] || "").trim().toLowerCase();
    if (cell && (cell.includes(target) || target.includes(cell))) return i + 2;
  }
  return null;
}

export async function listSheetsInFolder(folderId: string): Promise<{ id: string; title: string }[]> {
  const auth = getServiceAccountAuth();
  const drive = google.drive({ version: "v3", auth: auth as any });

  const list = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    spaces: "drive",
    fields: "files(id, name)",
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "allDrives",
  });

  return (list.data.files || [])
    .filter((f) => f.id && f.name)
    .map((f) => ({ id: f.id as string, title: f.name as string }));
}

// Header row matches the column order lib/sheets.ts readLeadSheet() expects
// (A2:I): Company, Phone, Email, Website, Facebook, Date Called, Outcome,
// Call Back, Notes — so this sheet can be synced with the same logic as
// every sheet Lucky builds by hand.
const LEAD_SHEET_HEADER = ["Company", "Phone", "Email", "Website", "Facebook", "Date Called", "Outcome", "Call Back", "Notes"];

export async function createLeadSheet(title: string, folderId: string): Promise<string> {
  const auth = getServiceAccountAuth();
  const sheets = google.sheets({ version: "v4", auth: auth as any });
  const drive = google.drive({ version: "v3", auth: auth as any });

  // sheets.spreadsheets.create() has no way to specify a parent folder — it
  // always writes into the service account's own My Drive first, which has
  // zero storage quota for a bare (non-domain-delegated) service account,
  // so the write is rejected outright ("The caller does not have
  // permission" — identical to every other 403, making it look like a
  // permissions problem rather than a quota one). Creating via the Drive
  // API directly, with the Email Outreach folder set as the parent at
  // creation time, writes straight into a folder that has real quota (a
  // real human's) instead.
  const created = await drive.files.create({
    requestBody: { name: title, mimeType: "application/vnd.google-apps.spreadsheet", parents: [folderId] },
    fields: "id",
    supportsAllDrives: true,
  });
  const spreadsheetId = created.data.id;
  if (!spreadsheetId) throw new Error("Failed to create spreadsheet — no ID returned.");

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "A1:I1",
    valueInputOption: "RAW",
    requestBody: { values: [LEAD_SHEET_HEADER] },
  });

  return spreadsheetId;
}
