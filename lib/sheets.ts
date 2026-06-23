import { google } from "googleapis";

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
