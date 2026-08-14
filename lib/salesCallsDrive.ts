import { google } from "googleapis";
import { getLuckyGoogleAuthedClient } from "./luckyGoogleAuth";
import { SalesCall, ScriptVersion } from "./types";

// Organizational parent folder only — files are created under Lucky's own
// connected Google account (see lib/luckyGoogleAuth.ts), so he already owns
// everything created here; this just keeps backups alongside everything
// else in one place instead of scattering into Drive's root.
const DEFAULT_FOLDER_ID = "1_2E0ugCHU8POB7O3abgksA0OKGMlVOeR";

const HEADER = [
  "Call Date", "Prospect Name", "Business", "Outcome", "Main Objection",
  "Next Step Booked", "Next Step", "Went Well", "Work Ons", "Raw Summary", "Logged At",
];

function toRow(c: SalesCall): string[] {
  return [
    c.call_date, c.prospect_name, c.business_name, c.outcome, c.main_objection,
    c.next_step_booked ? "Yes" : "No", c.next_step_detail, c.went_well, c.work_ons,
    c.raw_summary, c.created_at,
  ];
}

const SCRIPT_HEADER = ["Version", "Current", "Changelog", "Created At", "Content"];

function toScriptRow(v: ScriptVersion): string[] {
  return [String(v.version), v.is_current ? "Yes" : "No", v.changelog, v.created_at, v.content];
}

export interface BackupResult {
  spreadsheetId: string;
  url: string;
}

// Reuses one spreadsheet across every backup (the caller persists
// spreadsheetId and passes it back in) instead of creating a new file each
// time — this runs automatically after every call log, so a fresh file per
// call would spam the Drive folder.
export async function backupSalesCallsToDrive(
  calls: SalesCall[],
  scriptVersions: ScriptVersion[],
  existingSpreadsheetId?: string | null
): Promise<BackupResult> {
  const auth = await getLuckyGoogleAuthedClient();
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  let spreadsheetId = existingSpreadsheetId || null;

  if (spreadsheetId) {
    // Confirm it still exists (could have been deleted from Drive by hand) —
    // if not, fall through and create a new one below.
    try {
      await sheets.spreadsheets.get({ spreadsheetId, fields: "spreadsheetId" });
    } catch {
      spreadsheetId = null;
    }
  }

  if (!spreadsheetId) {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
    const createdFile = await drive.files.create({
      requestBody: { name: "Sales Calls Backup", mimeType: "application/vnd.google-apps.spreadsheet", parents: [folderId] },
      fields: "id",
      supportsAllDrives: true,
    });
    spreadsheetId = createdFile.data.id || null;
    if (!spreadsheetId) throw new Error("Failed to create spreadsheet — no ID returned.");

    // A blank spreadsheet created this way has one default "Sheet1" tab —
    // rename it to "Calls" and add "Master Script Versions" to match the
    // two-tab layout the rest of this function writes to.
    const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
    const defaultSheetId = sheetMeta.data.sheets?.[0]?.properties?.sheetId;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          { updateSheetProperties: { properties: { sheetId: defaultSheetId, title: "Calls" }, fields: "title" } },
          { addSheet: { properties: { title: "Master Script Versions" } } },
        ],
      },
    });
  }

  const callValues = [HEADER, ...calls.map(toRow)];
  const scriptValues = [SCRIPT_HEADER, ...scriptVersions.map(toScriptRow)];
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: "Calls!A1", values: callValues },
        { range: "Master Script Versions!A1", values: scriptValues },
      ],
    },
  });

  return { spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` };
}
