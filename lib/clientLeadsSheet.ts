import { google } from "googleapis";
import { getLuckyGoogleAuthedClient } from "./luckyGoogleAuth";

// Organizational parent folder only — same one every other Drive/Docs helper
// in this app files things under (see lib/googleDocs.ts, lib/salesCallsDrive.ts).
const DEFAULT_FOLDER_ID = "1_2E0ugCHU8POB7O3abgksA0OKGMlVOeR";

const HEADER = ["Date", "Lead Name", "Phone", "Email", "Called?", "Status", "Notes"];

// Meta lead ads for this client feed into this sheet (set up separately by
// Lucky on Meta's side — no automation here yet). Lucky scans it daily as
// the appointment setter and marks each lead Called + a status (warm/hot/
// etc) by hand — deliberately NOT wired to Google Calendar yet.
export async function createClientLeadsSheet(company: string, parentId?: string): Promise<string> {
  const auth = await getLuckyGoogleAuthedClient();
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  const folderId = parentId || process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
  const created = await drive.files.create({
    requestBody: { name: `${company} — Leads`, mimeType: "application/vnd.google-apps.spreadsheet", parents: [folderId] },
    fields: "id",
    supportsAllDrives: true,
  });
  const spreadsheetId = created.data.id;
  if (!spreadsheetId) throw new Error("Failed to create client leads spreadsheet — no ID returned.");

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Sheet1!A1",
    valueInputOption: "RAW",
    requestBody: { values: [HEADER] },
  });

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
