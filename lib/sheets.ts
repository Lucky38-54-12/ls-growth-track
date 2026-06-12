import { google } from "googleapis";

export interface SheetRow {
  company: string;
  phone: string;
  email: string;
  website: string;
  facebook: string;
  dateCalled: string;
  outcome: string;
  callBack: string;
  notes: string;
}

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

function getAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var is not set");
  const credentials = JSON.parse(key);
  return new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
}

export async function readLeadSheet(sheetId: string): Promise<SheetRow[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "A2:I",
  });

  const rows = res.data.values || [];
  return rows
    .map((r) => ({
      company: (r[0] || "").trim(),
      phone: (r[1] || "").trim(),
      email: (r[2] || "").trim(),
      website: (r[3] || "").trim(),
      facebook: (r[4] || "").trim(),
      dateCalled: (r[5] || "").trim(),
      outcome: (r[6] || "").trim(),
      callBack: (r[7] || "").trim(),
      notes: (r[8] || "").trim(),
    }))
    .filter((r) => r.company || r.email);
}

export function hasCallInfo(row: SheetRow): boolean {
  return !!(row.dateCalled || row.outcome || row.callBack || row.notes);
}

export function formatCallNotes(row: SheetRow): string {
  const parts: string[] = [];
  if (row.dateCalled) parts.push(`Date called: ${row.dateCalled}`);
  if (row.outcome) parts.push(`Outcome: ${row.outcome}`);
  if (row.callBack) parts.push(`Call back: ${row.callBack}`);
  if (row.notes) parts.push(`Notes: ${row.notes}`);
  return parts.join("\n");
}
