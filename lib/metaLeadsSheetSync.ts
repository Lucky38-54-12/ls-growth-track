import { google } from "googleapis";
import { getLuckyGoogleAuthedClient } from "./luckyGoogleAuth";
import { sendFreeformEmail } from "./email";

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
  "Lead ID", "Called?", "Outcome", "Intent", "Notes", "Booked Date/Time", "Client Notified",
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

// Meta's answer values already carry the meaning on their own (e.g.
// "fencing", "within_1–3_months") — repeating the full question text as a
// label in front of each one ("what are you looking to have done: fencing")
// was way more than a quick scan needs. Just the cleaned-up values, joined.
function cleanValue(v: string): string {
  const cleaned = v.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function buildDetails(row: string[], cols: DetectedColumns): string {
  return cols.detailCols
    .map(({ idx }) => (row[idx] ? cleanValue(row[idx]) : null))
    .filter(Boolean)
    .join(", ");
}

// Meta's created_time comes through as a raw ISO timestamp in whatever
// offset that particular ad form happens to report (some +12:00, some
// -05:00, inconsistently) — not something Lucky should have to read at a
// glance. Reformat to NZ local time in plain hours.
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
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

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties,sheets.tables" });
  const targetSheet = meta.data.sheets?.find((s) => s.properties?.title === targetTab);
  const sheetId = targetSheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) throw new Error(`Target tab "${targetTab}" not found`);
  const existingTable = targetSheet?.tables?.[0];

  const tabTitles = (meta.data.sheets || []).map((s) => s.properties?.title).filter((t): t is string => !!t && t !== targetTab);

  const existingRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${targetTab}'!I2:I` }).catch(() => ({ data: { values: [] } }));
  const existingIds = new Set((existingRes.data.values || []).map((r) => r[0]).filter(Boolean));
  const existingRowCount = (existingRes.data.values || []).length;

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
        cols.dateIdx >= 0 && row[cols.dateIdx] ? formatDate(row[cols.dateIdx]) : "",
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
        "",    // Intent
        "",    // Notes
        "",    // Booked Date/Time
        false, // Client Notified
      ]);
      existingIds.add(id);
      count++;
    }
    perSource[tab] = count;
  }

  if (newRows.length > 0) {
    // New leads land right under the header, not at the bottom — Lucky
    // scans top-down, so the newest leads should be the first thing he
    // sees. Blank rows are inserted first (inheriting the formatting of the
    // row after the insertion point, i.e. the existing first data row, not
    // the header) so this doesn't disturb any existing Called?/Outcome/Notes
    // entries below.
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            insertDimension: {
              range: { sheetId, dimension: "ROWS", startIndex: 1, endIndex: 1 + newRows.length },
              inheritFromBefore: false,
            },
          },
        ],
      },
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${targetTab}'!A2`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: newRows },
    });

    // Extend the Called?/Outcome checkbox+dropdown only over the rows that
    // just landed — not pre-allocated headroom below the real data, which is
    // what caused empty rows to render as a stray "FALSE" before.
    await applyTrackingValidation(sheets, spreadsheetId, sheetId, 1, 1 + newRows.length);
  }

  await ensureLeadsTable(sheets, spreadsheetId, sheetId, targetTab, existingTable, existingRowCount + newRows.length);

  return { added: newRows.length, perSource, sourceTabsFound };
}

// Creates (or, on later syncs, resizes) a native Sheets Table over the
// header + every data row — gives Lucky sorting/filtering and banded rows
// for free without us hand-maintaining alternating colors. Table range is
// always set explicitly from the row counts we already tracked rather than
// relying on the table's own auto-expand, since that's UI-edit-triggered
// and not guaranteed to fire for API writes.
async function ensureLeadsTable(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetId: number,
  targetTab: string,
  existingTable: { tableId?: string | null } | undefined,
  totalDataRows: number
): Promise<void> {
  const range = {
    sheetId,
    startRowIndex: 0,
    endRowIndex: 1 + totalDataRows,
    startColumnIndex: 0,
    endColumnIndex: TARGET_HEADER.length,
  };

  if (existingTable?.tableId) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ updateTable: { table: { tableId: existingTable.tableId, range }, fields: "range" } }] },
    });
  } else {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addTable: { table: { name: `${targetTab} Table`, range } } }] },
    });
  }
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
  const intentColIdx = TARGET_HEADER.indexOf("Intent");

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
          // What happened on the call — separate from how good the lead
          // actually is (Intent, below). A lead can be "No answer" three
          // times before you ever get to judge intent, or picked up and
          // turn out to be a tire kicker despite answering right away.
          setDataValidation: {
            range: { sheetId, startRowIndex, endRowIndex, startColumnIndex: outcomeColIdx, endColumnIndex: outcomeColIdx + 1 },
            rule: {
              condition: {
                type: "ONE_OF_LIST",
                values: [
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
        {
          setDataValidation: {
            range: { sheetId, startRowIndex, endRowIndex, startColumnIndex: intentColIdx, endColumnIndex: intentColIdx + 1 },
            rule: {
              condition: {
                type: "ONE_OF_LIST",
                values: [
                  { userEnteredValue: "Tire kicker" },
                  { userEnteredValue: "Cold" },
                  { userEnteredValue: "Warm" },
                  { userEnteredValue: "Hot" },
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

  await ensureLeadsTable(sheets, spreadsheetId, sheetId, targetTab, undefined, 0);
}

export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fromUrl) return fromUrl[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export interface BookingNotifyResult {
  notified: number;
}

// Fired right after each sync (see /api/cron/sync-lead-sheets) — scans for
// rows Lucky has marked Outcome "Booked" with a Booked Date/Time filled in
// that haven't been emailed to the client yet (Client Notified still
// false), batches them into one digest email per run rather than one email
// per lead, then flags those exact rows as notified so they're never
// re-sent on the next sync.
export async function notifyBookedLeads(
  spreadsheetId: string,
  targetTab: string,
  clientEmail: string,
  clientName: string
): Promise<BookingNotifyResult> {
  const auth = await getLuckyGoogleAuthedClient();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${targetTab}'!A2:N` });
  const rows = res.data.values || [];

  const outcomeIdx = TARGET_HEADER.indexOf("Outcome");
  const bookedIdx = TARGET_HEADER.indexOf("Booked Date/Time");
  const notifiedIdx = TARGET_HEADER.indexOf("Client Notified");

  const toNotify: { rowIndex: number; name: string; phone: string; city: string; details: string; booked: string }[] = [];
  rows.forEach((row, i) => {
    const outcome = row[outcomeIdx];
    const booked = row[bookedIdx];
    const notified = row[notifiedIdx];
    if (outcome === "Booked" && booked && notified !== "TRUE" && notified !== true) {
      toNotify.push({ rowIndex: i + 2, name: row[1] || "", phone: row[2] || "", city: row[4] || "", details: row[5] || "", booked });
    }
  });

  if (toNotify.length === 0) return { notified: 0 };

  const subject = toNotify.length === 1 ? `New booking: ${toNotify[0].name}` : `${toNotify.length} new bookings`;
  const rowsHtml = toNotify
    .map(
      (b) =>
        `<tr><td style="padding:6px 12px 6px 0"><strong>${b.name}</strong></td><td style="padding:6px 12px 6px 0">${b.phone}</td><td style="padding:6px 12px 6px 0">${b.city}</td><td style="padding:6px 12px 6px 0"><strong>${b.booked}</strong></td><td style="padding:6px 0">${b.details}</td></tr>`
    )
    .join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;">
  <p style="margin:0 0 12px">Hey ${clientName},</p>
  <p style="margin:0 0 16px">${toNotify.length === 1 ? "A new appointment's been booked" : `${toNotify.length} new appointments have been booked`} from your leads:</p>
  <table style="border-collapse:collapse;font-size:14px;">
    <tr style="text-align:left;color:#64748b;font-size:12px;text-transform:uppercase;"><th style="padding:0 12px 6px 0">Name</th><th style="padding:0 12px 6px 0">Phone</th><th style="padding:0 12px 6px 0">City</th><th style="padding:0 12px 6px 0">Booked for</th><th style="padding:0 0 6px 0">Details</th></tr>
    ${rowsHtml}
  </table>
  <p style="margin:16px 0 0">Cheers,<br>Lucky<br>LS Growth</p>
</div>`;

  await sendFreeformEmail(clientEmail, subject, html);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: toNotify.map((b) => ({
        range: `'${targetTab}'!${String.fromCharCode(65 + notifiedIdx)}${b.rowIndex}`,
        values: [[true]],
      })),
    },
  });

  return { notified: toNotify.length };
}
