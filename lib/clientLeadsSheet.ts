import { google } from "googleapis";
import { getLuckyGoogleAuthedClient } from "./luckyGoogleAuth";
import { provisionLeadsTab } from "./metaLeadsSheetSync";

// Organizational parent folder only — same one every other Drive/Docs helper
// in this app files things under (see lib/googleDocs.ts, lib/salesCallsDrive.ts).
const DEFAULT_FOLDER_ID = "1_2E0ugCHU8POB7O3abgksA0OKGMlVOeR";

export const CLIENT_LEADS_TARGET_TAB = "All leads done";

// Creates a brand-new client leads spreadsheet with the exact same "All
// leads done" tab setup as every other client's Meta leads sheet (native
// Sheets Table, frozen header, auto-resized columns, Called?/Outcome
// checkbox+dropdown) — see provisionLeadsTab() in metaLeadsSheetSync.ts,
// the same function every sync run re-applies. Meta's native lead-ad
// integration (set up separately by Lucky on Meta's side) writes raw leads
// into its own tab (Sheet1, Sheet2, ...) alongside this one; the caller is
// responsible for registering the returned spreadsheetId in
// lead_sheet_syncs so the existing 15-min cron (sync-lead-sheets) picks it
// up and keeps "All leads done" in sync + fires booking notifications,
// exactly like Build It All.
export async function createClientLeadsSheet(company: string, parentId?: string): Promise<{ url: string; spreadsheetId: string }> {
  const auth = await getLuckyGoogleAuthedClient();
  const drive = google.drive({ version: "v3", auth });

  const folderId = parentId || process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
  const created = await drive.files.create({
    requestBody: { name: `${company} — Leads`, mimeType: "application/vnd.google-apps.spreadsheet", parents: [folderId] },
    fields: "id",
    supportsAllDrives: true,
  });
  const spreadsheetId = created.data.id;
  if (!spreadsheetId) throw new Error("Failed to create client leads spreadsheet — no ID returned.");

  await provisionLeadsTab(spreadsheetId, CLIENT_LEADS_TARGET_TAB);

  return { url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, spreadsheetId };
}
