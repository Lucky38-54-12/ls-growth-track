import { NextResponse } from "next/server";
import { google } from "googleapis";
import { syncLeadsFromSheet } from "@/lib/sheetSync";

export const dynamic = "force-dynamic";

function getDriveAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var not set");
  const credentials = JSON.parse(key);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

// Fallback matches the "Email Outreach" folder ID — not a secret, just kept here
// because the GOOGLE_DRIVE_FOLDER_ID env var wasn't reliably set in production.
const DEFAULT_FOLDER_ID = "1_2E0ugCHU8POB7O3abgksA0OKGMlVOeR";

export async function GET() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;

  const auth = getDriveAuth();
  const drive = google.drive({ version: "v3", auth: auth as any });
  const list = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    spaces: "drive",
    fields: "files(id, name)",
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "allDrives",
  });
  const files = list.data.files || [];

  if (files.length === 0) {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "{}");
    return NextResponse.json({
      found: 0,
      debug: { folderId, serviceAccountEmail: creds.client_email },
    });
  }

  const results = [];
  for (const file of files) {
    if (!file.id) continue;
    try {
      const result = await syncLeadsFromSheet({
        sheetId: file.id,
        tradeDefault: "",
        locationDefault: "",
        personalize: false,
        sendFresh: false,
      });
      results.push({ name: file.name, id: file.id, ...result });
    } catch (e) {
      results.push({ name: file.name, id: file.id, error: e instanceof Error ? e.message : "sync failed" });
    }
  }

  return NextResponse.json({ found: files.length, results });
}
