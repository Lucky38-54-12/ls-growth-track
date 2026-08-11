import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { readLeadSheet, getSheetTitle } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Read-only scan across every sheet in the cold-call/outreach Drive folder,
// looking for rows whose Outcome/Call Back/Notes columns suggest a lead was
// interested but not ready yet ("call back in a couple months", etc). Makes
// no writes anywhere — this is purely so Lucky doesn't have to open every
// sheet by hand to find these before deciding what to do with them.
const DEFAULT_FOLDER_ID = "1_2E0ugCHU8POB7O3abgksA0OKGMlVOeR";

const INTEREST_HINTS = [
  "interested", "call back", "callback", "call again", "try again",
  "not ready", "too busy", "call in", "check back", "follow up", "re-contact",
  "later", "months", "month", "weeks", "next year", "call later", "revisit",
];

// Some sheets have leftover unfilled template rows where every cell still
// holds its own column header text ("Business Name", "Outcome", "Call back",
// ...) — those literal header echoes aren't real call data, and "Call back"
// alone would otherwise match INTEREST_HINTS every time.
function isPlaceholderRow(company: string, outcome: string, callBack: string): boolean {
  const c = company.trim().toLowerCase();
  const o = outcome.trim().toLowerCase();
  const cb = callBack.trim().toLowerCase();
  return c === "business name" || o === "outcome" || cb === "call back";
}

function looksLikeDeferredInterest(company: string, outcome: string, callBack: string, notes: string): boolean {
  if (isPlaceholderRow(company, outcome, callBack)) return false;
  const blob = `${outcome} ${callBack} ${notes}`.toLowerCase();
  if (!blob.trim()) return false;
  // Explicit "not interested" / dead-end outcomes never count, even if a stray
  // word like "later" appears in the notes.
  if (/(not interested|no thanks|do not call|dnc|wrong number|disconnected|bad number)/.test(blob)) return false;
  return INTEREST_HINTS.some((hint) => blob.includes(hint));
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

// Google Sheets read quota is per-minute, not per-request — reading 20
// spreadsheets fully in parallel blew through it. Cap concurrency instead.
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

function getDriveAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var not set");
  const credentials = JSON.parse(key);
  return new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folderId = req.nextUrl.searchParams.get("folderId") || process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
  const offset = Number(req.nextUrl.searchParams.get("offset") || "0");
  const limit = Number(req.nextUrl.searchParams.get("limit") || "20");

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

  const matches: {
    sheetTitle: string;
    sheetId: string;
    company: string;
    phone: string;
    email: string;
    dateCalled: string;
    outcome: string;
    callBack: string;
    notes: string;
  }[] = [];
  const errors: string[] = [];

  // Read every sheet in the batch, capped at a small concurrency — fully
  // serial blew the 60s function timeout, fully parallel blew the Sheets
  // API per-minute read quota.
  await mapWithConcurrency(batch, 2, async (file) => {
    if (!file.id) return;
    try {
      const [title, rows] = await Promise.all([
        withRetry(() => getSheetTitle(file.id!)).catch(() => file.name || file.id!),
        withRetry(() => readLeadSheet(file.id!)),
      ]);
      for (const row of rows) {
        if (looksLikeDeferredInterest(row.company, row.outcome, row.callBack, row.notes)) {
          matches.push({
            sheetTitle: title,
            sheetId: file.id,
            company: row.company,
            phone: row.phone,
            email: row.email,
            dateCalled: row.dateCalled,
            outcome: row.outcome,
            callBack: row.callBack,
            notes: row.notes,
          });
        }
      }
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
    matchesFound: matches.length,
    matches,
    errors,
  });
}
