import { google } from "googleapis";
import { getLuckyGoogleAuthedClient } from "./luckyGoogleAuth";

// Generic version of the Build It All sync — works for ANY client's Meta
// Lead Ads spreadsheet, not just one. Each ad form's native integration
// writes new leads into its own raw tab (Sheet1, Sheet2, ...) with whatever
// column order and extra custom questions that particular form happens to
// ask — which is exactly what broke a fixed-column-letter approach the
// first time (Sheet3 had an extra "budget" question, shifting every column
// after it). This detects columns by HEADER NAME instead, so it auto-adapts
// to any form shape without per-client configuration: known Meta fields
// (id, created_time, full_name, phone_number, email, city, lead_status) are
// mapped by name, and every other column — the form's own custom questions,
// whatever they're called — gets folded into "Details" as "label: value"
// pairs. Raw feed tabs are never written to; only the target tab is
// appended to, and only with genuinely new leads (deduped by Meta's lead id
// in the Lead ID column), so existing Called?/Outcome/Notes entries are
// never disturbed.

export const TARGET_HEADER = [
  "Date", "Name", "Phone", "Email", "City", "Details", "Source Tab", "Lead Status",
  "Lead ID", "Called?", "Outcome", "Notes",
];

// Internal Meta plumbing fields — never shown to Lucky, not folded into
// Details either (noise, not something he'd call about).
const IGNORE_FIELDS = new Set([
  "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id", "campaign_name",
  "form_id", "form_name", "is_organic", "platform", "inbox_url",
]);

const FIELD_ALIASES: Record<string, string[]> = {
  id: ["id"],
  date: ["created_time"],
  name: ["full_name", "name"],
  phone: ["phone_number", "phone"],
  email: ["email"],
  city: ["city"],
  status: ["lead_status", "status"],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

interface DetectedColumns {
  idIdx: number;
  dateIdx: number;
  nameIdx: number;
  phoneIdx: number;
  emailIdx: number;
  cityIdx: number;
  statusIdx: number;
  detailCols: { idx: number; label: string }[];
}

function detectColumns(header: string[]): DetectedColumns | null {
  const normalized = header.map(normalizeHeader);
  const find = (aliases: string[]) => normalized.findIndex((h) => aliases.includes(h));

  const idIdx = find(FIELD_ALIASES.id);
  const nameIdx = find(FIELD_ALIASES.name);
  const phoneIdx = find(FIELD_ALIASES.phone);
  // Not a Meta lead form tab if the basics aren't even there.
  if (idIdx === -1 || nameIdx === -1 || phoneIdx === -1) return null;

  const dateIdx = find(FIELD_ALIASES.date);
  const emailIdx = find(FIELD_ALIASES.email);
  const cityIdx = find(FIELD_ALIASES.city);
  const statusIdx = find(FIELD_ALIASES.status);

  const known = new Set([idIdx, dateIdx, nameIdx, phoneIdx, emailIdx, cityIdx, statusIdx]);
  const detailCols = header
    .map((label, idx) => ({ idx, label }))
    .filter(({ idx, label }) => !known.has(idx) && !IGNORE_FIELDS.has(normalizeHeader(label)) && label.trim());

  return { idIdx, dateIdx, nameIdx, phoneIdx, emailIdx, cityIdx, statusIdx, detailCols };
}

function buildDetails(row: string[], cols: DetectedColumns): string {
  return cols.detailCols
    .map(({ idx, label }) => (row[idx] ? `${label.replace(/[?_]/g, (m) => (m === "_" ? " " : "")).trim()}: ${row[idx]}` : null))
    .filter(Boolean)
    .join(" | ");
}

export interface SyncResult {
  added: number;
  perSource: Record<string, number>;
  sourceTabsFound: string[];
}

// Auto-discovers which tabs look like Meta lead feeds (rather than requiring
// a hardcoded tab list per client) — anything with id/full_name/phone_number
// columns, excluding the target tab itself.
export async function syncMetaLeadsSheet(spreadsheetId: string, targetTab: string = "All Leads"): Promise<SyncResult> {
  const auth = await getLuckyGoogleAuthedClient();
  const sheets = google.sheets({ version: "v4", auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const tabTitles = (meta.data.sheets || []).map((s) => s.properties?.title).filter((t): t is string => !!t && t !== targetTab);

  const existingRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${targetTab}'!I2:I` }).catch(() => ({ data: { values: [] } }));
  const existingIds = new Set((existingRes.data.values || []).map((r) => r[0]).filter(Boolean));

  const newRows: (string | boolean)[][] = [];
  const perSource: Record<string, number> = {};
  const sourceTabsFound: string[] = [];

  for (const tab of tabTitles) {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!A1:ZZ` }).catch(() => null);
    const values = res?.data.values || [];
    if (values.length < 1) continue;

    const cols = detectColumns(values[0]);
    if (!cols) continue; // not a lead form tab (e.g. an unrelated/static tab)
    sourceTabsFound.push(tab);

    let count = 0;
    for (const row of values.slice(1)) {
      const id = row[cols.idIdx];
      if (!id || existingIds.has(id)) continue;

      newRows.push([
        cols.dateIdx >= 0 ? row[cols.dateIdx] || "" : "",
        row[cols.nameIdx] || "",
        row[cols.phoneIdx] || "",
        cols.emailIdx >= 0 ? row[cols.emailIdx] || "" : "",
        cols.cityIdx >= 0 ? row[cols.cityIdx] || "" : "",
        buildDetails(row, cols),
        tab,
        cols.statusIdx >= 0 ? row[cols.statusIdx] || "" : "",
        id,
        false, // Called?
        "",    // Outcome
        "",    // Notes
      ]);
      existingIds.add(id);
      count++;
    }
    perSource[tab] = count;
  }

  if (newRows.length > 0) {
    // Writes to an explicit row (existing Lead ID count + 2) instead of
    // using values.append's own "find the last row" heuristic — that
    // heuristic treats checkbox-validated cells in the Called? column as
    // "data present" even when they hold no real value (an empty checkbox
    // cell reads back as FALSE), which pushed writes thousands of rows past
    // the real data the first time this ran. Lead ID (col I) is never
    // checkbox-formatted, so counting rows there gives the true next row.
    const nextRow = 2 + (existingRes.data.values || []).length;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${targetTab}'!A${nextRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: newRows },
    });

    // Extend the Called?/Outcome checkbox+dropdown only over the rows that
    // just landed — not pre-allocated headroom below the real data, which is
    // what caused empty rows to render as a stray "FALSE" before. Grows by
    // exactly newRows.length each sync, never further ahead than that.
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
    const sheetId = meta.data.sheets?.find((s) => s.properties?.title === targetTab)?.properties?.sheetId;
    if (sheetId !== undefined && sheetId !== null) {
      await applyTrackingValidation(sheets, spreadsheetId, sheetId, nextRow - 1, nextRow - 1 + newRows.length);
    }
  }

  return { added: newRows.length, perSource, sourceTabsFound };
}

// Called?/Outcome checkbox+dropdown for exactly [startRowIndex, endRowIndex)
// (0-indexed, header-exclusive) — shared by provisioning (a thin starter
// range) and every sync (extended by exactly however many rows it added).
async function applyTrackingValidation(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetId: number,
  startRowIndex: number,
  endRowIndex: number
): Promise<void> {
  if (endRowIndex <= startRowIndex) return;
  const calledColIdx = TARGET_HEADER.indexOf("Called?");
  const outcomeColIdx = TARGET_HEADER.indexOf("Outcome");

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          setDataValidation: {
            range: { sheetId, startRowIndex, endRowIndex, startColumnIndex: calledColIdx, endColumnIndex: calledColIdx + 1 },
            rule: { condition: { type: "BOOLEAN" }, strict: true },
          },
        },
        {
          setDataValidation: {
            range: { sheetId, startRowIndex, endRowIndex, startColumnIndex: outcomeColIdx, endColumnIndex: outcomeColIdx + 1 },
            rule: {
              condition: {
                type: "ONE_OF_LIST",
                values: [
                  { userEnteredValue: "Warm" },
                  { userEnteredValue: "Hot" },
                  { userEnteredValue: "Booked" },
                  { userEnteredValue: "Not interested" },
                  { userEnteredValue: "No answer" },
                  { userEnteredValue: "Callback later" },
                ],
              },
              strict: true,
              showCustomUi: true,
            },
          },
        },
      ],
    },
  });
}

// One-time setup for a new client: creates the target tab (if missing) with
// the header and frozen header row. Checkbox/dropdown validation is applied
// per-sync as real rows land (see applyTrackingValidation above), not
// pre-allocated here — so there's never a "FALSE" bleeding into empty rows
// below the real data.
export async function provisionLeadsTab(spreadsheetId: string, targetTab: string = "All Leads"): Promise<void> {
  const auth = await getLuckyGoogleAuthedClient();
  const sheets = google.sheets({ version: "v4", auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  let sheetId = meta.data.sheets?.find((s) => s.properties?.title === targetTab)?.properties?.sheetId;

  if (sheetId === undefined || sheetId === null) {
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        // columnCount deliberately left at Sheets' normal default (26) rather
        // than capped to TARGET_HEADER.length — capping it cuts off the grid
        // right after the last used column with no gridlines past it, which
        // reads as broken/abnormal next to every other tab's default grid.
        requests: [{ addSheet: { properties: { title: targetTab, index: 0, gridProperties: { rowCount: 1000 } } } }],
      },
    });
    sheetId = addRes.data.replies![0].addSheet!.properties!.sheetId!;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${targetTab}'!A1:${String.fromCharCode(64 + TARGET_HEADER.length)}1`,
    valueInputOption: "RAW",
    requestBody: { values: [TARGET_HEADER] },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
        { autoResizeDimensions: { dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: TARGET_HEADER.length } } },
      ],
    },
  });
}

export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fromUrl) return fromUrl[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}
