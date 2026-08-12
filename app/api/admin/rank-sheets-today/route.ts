import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { readLeadSheet, getSheetTitle } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Read-only ranking of every sheet in the cold-call Drive folder by how many
// leads in it have never been called — the sheets worth working through
// today are the ones with real untouched inventory left, not the ones
// that are already fully worked or fully saturated with "booked out" no's.
const DEFAULT_FOLDER_ID = "1_2E0ugCHU8POB7O3abgksA0OKGMlVOeR";

function getDriveAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var not set");
  const credentials = JSON.parse(key);
  return new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (attempt >= retries || !message.includes("Quota exceeded")) throw e;
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
    }
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folderId = req.nextUrl.searchParams.get("folderId") || process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
  const offset = Number(req.nextUrl.searchParams.get("offset") || "0");
  const limit = Number(req.nextUrl.searchParams.get("limit") || "10");

  const auth = getDriveAuth();
  const drive = google.drive({ version: "v3", auth: auth as any });
  const list = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    spaces: "drive",
    fields: "files(id, name)",
    pageSize: 200,
    orderBy: "name",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "allDrives",
  });
  const files = list.data.files || [];
  const batch = files.slice(offset, offset + limit);

  const sheets: {
    sheetId: string;
    sheetTitle: string;
    totalRows: number;
    freshRows: number;
  }[] = [];
  const errors: string[] = [];

  await mapWithConcurrency(batch, 2, async (file) => {
    if (!file.id) return;
    try {
      const [title, rows] = await Promise.all([
        withRetry(() => getSheetTitle(file.id!)).catch(() => file.name || file.id!),
        withRetry(() => readLeadSheet(file.id!)),
      ]);
      // "Fresh" = a real row (has a company or phone) that's never been
      // touched — no date called, no outcome, no call-back note, no notes.
      const freshRows = rows.filter((r) =>
        (r.company || r.phone) && !r.dateCalled && !r.outcome && !r.callBack && !r.notes
      ).length;
      sheets.push({ sheetId: file.id, sheetTitle: title, totalRows: rows.length, freshRows });
    } catch (e) {
      errors.push(`${file.name || file.id}: ${e instanceof Error ? e.message : "read failed"}`);
    }
  });

  const nextOffset = offset + limit;
  return NextResponse.json({
    totalSheets: files.length,
    processed: `${offset}-${Math.min(nextOffset, files.length)}`,
    done: nextOffset >= files.length,
    nextOffset: nextOffset >= files.length ? null : nextOffset,
    sheets,
    errors,
  });
}
