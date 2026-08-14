import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { SalesCall, ScriptVersion } from "./types";

const LUCKY_EMAIL = "luckyspersonal38@gmail.com";

// Same shared Drive folder the lead-sheet sync uses (lib/sheets-connector.ts)
// so backups show up alongside everything else instead of getting lost.
const DEFAULT_FOLDER_ID = "1_2E0ugCHU8POB7O3abgksA0OKGMlVOeR";

function getAuth(): JWT {
  const keyString = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyString) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var not set");
  const key = JSON.parse(keyString);
  return new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
}

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
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth: auth as any });
  const drive = google.drive({ version: "v3", auth: auth as any });

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
    // sheets.spreadsheets.create() has no way to specify a parent folder —
    // it always writes into the service account's own My Drive first, which
    // has zero storage quota for a bare (non-domain-delegated) service
    // account, so the write is rejected outright ("The caller does not have
    // permission" — identical to every other 403, making it look like a
    // permissions problem rather than a quota one). Creating via the Drive
    // API directly, with the shared folder set as the parent at creation
    // time, writes straight into a folder that has real quota (a real
    // human's) instead.
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

    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: { role: "writer", type: "user", emailAddress: LUCKY_EMAIL },
      sendNotificationEmail: false,
      supportsAllDrives: true,
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
