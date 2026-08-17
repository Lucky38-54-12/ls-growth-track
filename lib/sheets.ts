import { google } from "googleapis";

export const COLD_CALL_SHEETS_FOLDER_ID = "1_2E0ugCHU8POB7O3abgksA0OKGMlVOeR";

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

export async function listColdCallSheetFiles(folderId: string): Promise<{ id: string; name: string }[]> {
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
  { concurrency = 4, timeBudgetMs = 45000 }: { concurrency?: number; timeBudgetMs?: number } = {}
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
