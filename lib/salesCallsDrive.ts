import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { SalesCall } from "./types";

const LUCKY_EMAIL = "luckyspersonal38@gmail.com";

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

// Creates a fresh backup sheet each time it's called rather than updating one
// in place — simplest way to guarantee the export always matches exactly what
// was in Supabase at the moment of backup, with no partial-overwrite risk.
export async function backupSalesCallsToDrive(calls: SalesCall[]): Promise<string> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth: auth as any });
  const drive = google.drive({ version: "v3", auth: auth as any });

  const title = `Sales Calls Backup ${new Date().toISOString().split("T")[0]}`;
  const created = await sheets.spreadsheets.create({ requestBody: { properties: { title } } });
  const spreadsheetId = created.data.spreadsheetId;
  if (!spreadsheetId) throw new Error("Failed to create spreadsheet — no ID returned.");

  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: { role: "writer", type: "user", emailAddress: LUCKY_EMAIL },
    sendNotificationEmail: false,
  });

  const values = [HEADER, ...calls.map(toRow)];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "A1",
    valueInputOption: "RAW",
    requestBody: { values },
  });

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
