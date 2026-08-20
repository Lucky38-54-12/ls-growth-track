import { google } from "googleapis";

export const COLD_CALL_SHEETS_FOLDER_ID = "1_2E0ugCHU8POB7O3abgksA0OKGMlVOeR";

// "N. 📞 TODAY — Title", where N is the sheet's current rank among today's
// picks (re-numbered on every triage run so it always reflects that day's
// priority order, not just insertion order) — the number prefix is optional
// in the matcher so it still recognizes sheets tagged before numbering
// existed. Centralized here so the triage cron and the one-off admin routes
// (rename-sheets, untag-sheets) all agree on what counts as tagged.
const TODAY_TAG_RE = /^(?:\d+\.\s)?📞 TODAY — /;
export function hasTodayTag(title: string): boolean {
  return TODAY_TAG_RE.test(title);
}
export function stripTodayTag(title: string): string {
  return title.replace(TODAY_TAG_RE, "");
}
export function withTodayTag(title: string, position: number): string {
  return `${position}. 📞 TODAY — ${stripTodayTag(title)}`;
}

export interface SheetRanking {
  sheetId: string;
  sheetTitle: string;
  totalRows: number;
  freshRows: number;
}

function getDriveAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var not set");
  const credentials = JSON.parse(key);
  return new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
}

function getDriveWriteAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var not set");
  const credentials = JSON.parse(key);
  return new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive"] });
}

// Shared by the /api/admin/rename-sheets endpoint and the morning-brief cron
// so both go through the same rename path.
export async function renameSheetFile(sheetId: string, newName: string): Promise<void> {
  const auth = getDriveWriteAuth();
  const drive = google.drive({ version: "v3", auth: auth as any });
  await drive.files.update({ fileId: sheetId, requestBody: { name: newName }, supportsAllDrives: true });
}

const TODAY_INDEX_SHEET_NAME = "📞 Today's Call List";

export interface TodayIndexRow {
  rank: number;
  sheetId: string;
  title: string;
  freshRows: number;
}

// Single always-reused spreadsheet (found by name in the tracked folder,
// created once if missing) listing today's picks with clickable links —
// so Lucky can see the day's 1-5 by opening one sheet instead of browsing
// Drive. Rewritten in full on every triage run rather than diffed, since
// it's always exactly TARGET_TODAY_COUNT rows.
export async function updateTodayIndexSheet(rows: TodayIndexRow[]): Promise<{ spreadsheetId: string; url: string }> {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var not set");
  const credentials = JSON.parse(key);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/spreadsheets"] });
  const drive = google.drive({ version: "v3", auth: auth as any });
  const sheetsApi = google.sheets({ version: "v4", auth: auth as any });

  const existing = await drive.files.list({
    q: `'${COLD_CALL_SHEETS_FOLDER_ID}' in parents and name = '${TODAY_INDEX_SHEET_NAME}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  let spreadsheetId = existing.data.files?.[0]?.id || null;

  if (!spreadsheetId) {
    const created = await drive.files.create({
      requestBody: { name: TODAY_INDEX_SHEET_NAME, mimeType: "application/vnd.google-apps.spreadsheet", parents: [COLD_CALL_SHEETS_FOLDER_ID] },
      fields: "id",
      supportsAllDrives: true,
    });
    spreadsheetId = created.data.id || null;
    if (!spreadsheetId) throw new Error("Failed to create today-index spreadsheet");
  }

  const values = [
    ["#", "Sheet", "Untouched leads"],
    ...rows.map((r) => [
      String(r.rank),
      `=HYPERLINK("https://docs.google.com/spreadsheets/d/${r.sheetId}", "${r.title.replace(/"/g, "'")}")`,
      String(r.freshRows),
    ]),
  ];
  // Clear a fixed-size block first — values.update only touches cells it
  // has data for, so without this a shorter list than the last run's would
  // leave stale trailing rows below the new ones.
  await sheetsApi.spreadsheets.values.clear({ spreadsheetId, range: "A1:C20" });
  await sheetsApi.spreadsheets.values.update({
    spreadsheetId, range: "A1", valueInputOption: "USER_ENTERED", requestBody: { values },
  });

  return { spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` };
}

// Bounds a single network call — the googleapis client has no default
// request timeout, so a stalled connection would otherwise hang until the
// serverless function itself is killed, silently eating the whole time
// budget below.
function withTimeout<T>(fn: () => Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Request timed out")), ms)),
  ]);
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await withTimeout(fn);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      const retryable = message.includes("Quota exceeded") || message.includes("timed out");
      if (attempt >= retries || !retryable) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
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

export async function listColdCallSheetFiles(folderId: string): Promise<{ id: string; name: string }[]> {
  const auth = getDriveAuth();
  const drive = google.drive({ version: "v3", auth: auth as any });
  const list = await withRetry(() =>
    drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      spaces: "drive",
      fields: "files(id, name)",
      pageSize: 200,
      orderBy: "name",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "allDrives",
    })
  );
  return (list.data.files || []).filter((f): f is { id: string; name: string } => !!f.id).map((f) => ({ id: f.id!, name: f.name || f.id! }));
}

// Read-only ranking of sheets in the cold-call Drive folder by how many leads
// in each have never been called — the sheets worth working through today
// are the ones with real untouched inventory left, not the ones that are
// already fully worked or fully saturated with "booked out" no's. Time-boxed
// (rather than just count-capped) because each sheet costs two Sheets API
// calls and a 40-sheet scan blew past a 60s function timeout in practice —
// stops picking up new sheets once the deadline is close and returns
// whatever it has, marking the rest skipped rather than timing out the route.
export async function rankColdCallSheets(
  files: { id: string; name: string }[],
  { concurrency = 3, timeBudgetMs = 35000 }: { concurrency?: number; timeBudgetMs?: number } = {}
): Promise<{ sheets: SheetRanking[]; errors: string[]; scanned: number }> {
  const sheets: SheetRanking[] = [];
  const errors: string[] = [];
  const deadline = Date.now() + timeBudgetMs;
  let scanned = 0;

  await mapWithConcurrency(files, concurrency, async (file) => {
    if (Date.now() > deadline) return;
    scanned++;
    try {
      const [title, rows] = await Promise.all([
        withRetry(() => getSheetTitle(file.id)).catch(() => file.name),
        withRetry(() => readLeadSheet(file.id)),
      ]);
      const freshRows = rows.filter((r) =>
        (r.company || r.phone) && !r.dateCalled && !r.outcome && !r.callBack && !r.notes
      ).length;
      sheets.push({ sheetId: file.id, sheetTitle: title, totalRows: rows.length, freshRows });
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : "read failed"}`);
    }
  });

  return { sheets, errors, scanned };
}

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

export async function getSheetTitle(sheetId: string): Promise<string> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "properties.title" });
  return res.data.properties?.title || "";
}

const CITIES = [
  "Wellington", "Auckland", "Christchurch", "Hamilton", "Tauranga", "Dunedin",
  "Napier", "Hastings", "Nelson", "Rotorua", "Palmerston North", "Whangarei",
  "Invercargill", "New Plymouth", "Queenstown", "Wanganui", "Gisborne", "Timaru",
];

// Shorthand/misspellings seen in real sheet titles (e.g. "Chch Sparkys", "Inv- Builders")
// that don't substring-match the full city name above.
const CITY_ALIASES: Record<string, string> = {
  chch: "Christchurch", "chch-": "Christchurch", chrisrchurch: "Christchurch", christchurc: "Christchurch",
  inv: "Invercargill", "inv-": "Invercargill",
};

const TRADE_MAP: Record<string, string> = {
  cleaning: "Cleaning", cleaners: "Cleaning", cleaner: "Cleaning",
  builders: "Builders", building: "Builders", builder: "Builders",
  plumbing: "Plumbing", plumbers: "Plumbing", plumber: "Plumbing", plumnbers: "Plumbing",
  electrical: "Electrical", electricians: "Electrical", electrician: "Electrical", sparky: "Electrical", sparkys: "Electrical", sparkies: "Electrical",
  landscaping: "Landscaping", landscapers: "Landscaping", gardening: "Landscaping", gardeners: "Landscaping", lansdscaping: "Landscaping",
  painters: "Painting", painting: "Painting", painter: "Painting",
  roofing: "Roofing", roofers: "Roofing", roofer: "Roofing",
  movers: "Removals", removalists: "Removals", removals: "Removals", moving: "Removals",
  pestcontrol: "Pest Control", "pest control": "Pest Control",
  renovations: "Renovations", renovation: "Renovations",
  coatings: "Floor Coatings",
  fencing: "Fencing", fencers: "Fencing",
};

// Best-effort guess at trade/location from a sheet title like "Wellington Builders"
// or "Chch Sparkys". Falls back gracefully if nothing matches.
export function parseCampaignFromTitle(title: string): { trade?: string; location?: string } {
  const result: { trade?: string; location?: string } = {};
  if (!title) return result;

  const lower = title.toLowerCase();
  const words = lower.replace(/[^a-z\s-]/g, " ").split(/\s+/).filter(Boolean);

  for (const city of CITIES) {
    if (lower.includes(city.toLowerCase())) {
      result.location = `${city} NZ`;
      break;
    }
  }
  if (!result.location) {
    for (const word of words) {
      if (CITY_ALIASES[word]) {
        result.location = `${CITY_ALIASES[word]} NZ`;
        break;
      }
    }
  }

  for (const word of words) {
    if (TRADE_MAP[word]) {
      result.trade = TRADE_MAP[word];
      break;
    }
  }

  return result;
}

// Higher-ticket trades (~$10k+ average job) that outreach is now prioritizing
// over the lower-ticket ones (cleaning, fencing, etc.) already well covered.
export const PRIORITY_TRADES = ["Renovations", "Roofing", "Builders"];

export interface CoverageGap {
  trade: string;
  location: string;
  reason: "missing" | "low";
  freshRows?: number;
}

// For each priority trade, flag NZ cities with no cold-call sheet at all, or
// one that's down to single-digit untouched leads — these are the gaps worth
// running the scraper against. Only meaningful when `sheets` covers most of
// the folder; a partial scan (see rankColdCallSheets' time-box) will read as
// false "missing" gaps for sheets that exist but weren't reached this run.
export function findPriorityCoverageGaps(
  sheets: { sheetTitle: string; freshRows: number }[],
  {
    lowThreshold = 10, trades = PRIORITY_TRADES, cities = CITIES, isSaturated,
  }: {
    lowThreshold?: number; trades?: string[]; cities?: string[];
    // Segments with enough live/won meetings already — no point sourcing
    // more leads for a trade+city combo that's already converting. Keyed
    // the same way lib/leads.ts's segmentKey does: `${trade}|${location}`,
    // lowercased. Left undefined when the caller has no client/meeting data
    // on hand (e.g. a script running outside the dashboard's DB).
    isSaturated?: (trade: string, location: string) => boolean;
  } = {}
): CoverageGap[] {
  const annotated = sheets.map((s) => ({ ...s, ...parseCampaignFromTitle(s.sheetTitle) }));
  const gaps: CoverageGap[] = [];
  for (const trade of trades) {
    for (const city of cities) {
      const location = `${city} NZ`;
      if (isSaturated?.(trade, location)) continue;
      const match = annotated.find((s) => s.trade === trade && s.location === location);
      if (!match) {
        gaps.push({ trade, location: city, reason: "missing" });
      } else if (match.freshRows <= lowThreshold) {
        gaps.push({ trade, location: city, reason: "low", freshRows: match.freshRows });
      }
    }
  }
  return gaps;
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
