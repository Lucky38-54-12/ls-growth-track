import { google } from "googleapis";
import { createSupabaseClient } from "./supabase";
import { sendClientEmail } from "./email";
import { getLuckyGoogleAuthedClient } from "./luckyGoogleAuth";
import { TARGET_HEADER } from "./metaLeadsSheetSync";

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

const NUDGE_WEEKDAY = 1; // Monday (UTC), same slot as the other weekly jobs
// Fires before the job-outcome check-in's own 7-day sheet-staleness gate
// (lib/weeklyCheckin.ts) — the goal is to never need that fallback at all:
// catch an un-actioned lead on the client's own call sheet while it's still
// fresh enough to be a quick "haven't got to this yet" rather than letting
// it go stale enough to need asking "did this even turn into a job?".
const STALE_DAYS = 5;

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// Parses the exact "28 Oct 2026, 4:56 AM" shape metaLeadsSheetSync.ts's
// formatDate() writes into the Date column — not a generic date parser,
// deliberately tied to that one format rather than trusting JS's
// locale-dependent Date() constructor on a string nothing else controls.
function parseSheetDate(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  const [, dayStr, monAbbr, yearStr, hourStr, minStr, ampm] = m;
  const month = MONTHS[monAbbr.toLowerCase()];
  if (month === undefined) return null;
  let hour = parseInt(hourStr, 10) % 12;
  if (ampm.toUpperCase() === "PM") hour += 12;
  return new Date(parseInt(yearStr, 10), month, parseInt(dayStr, 10), hour, parseInt(minStr, 10));
}

// Weekly nudge straight to the client's own contact on their Meta Lead Ads
// call sheet (lib/metaLeadsSheetSync.ts) — any row still sitting with no
// Called?/Outcome after 5 days gets flagged to them directly, since it's
// their sheet and their follow-up, not Lucky's.
export async function sendStaleSheetLeadNudgeIfDue(sb: SupabaseClient): Promise<{ sent: number } | { sent: false }> {
  if (new Date().getUTCDay() !== NUDGE_WEEKDAY) return { sent: false };

  const { data: syncs } = await sb.from("lead_sheet_syncs").select("client_name, spreadsheet_id, target_tab");
  if (!syncs || syncs.length === 0) return { sent: 0 };

  const { data: clients } = await sb.from("lq_clients").select("name, email").eq("status", "active");
  const emailByName = new Map((clients || []).map((c) => [c.name, c.email]));

  const dateIdx = TARGET_HEADER.indexOf("Date");
  const nameIdx = TARGET_HEADER.indexOf("Name");
  const calledIdx = TARGET_HEADER.indexOf("Called?");
  const outcomeIdx = TARGET_HEADER.indexOf("Outcome");
  const detailsIdx = TARGET_HEADER.indexOf("Details");
  const lastCol = String.fromCharCode(65 + TARGET_HEADER.length - 1);
  const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;

  let sentCount = 0;

  for (const s of syncs) {
    const email = emailByName.get(s.client_name);
    if (!email) continue;

    const auth = await getLuckyGoogleAuthedClient();
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values
      .get({ spreadsheetId: s.spreadsheet_id, range: `'${s.target_tab}'!A2:${lastCol}` })
      .catch(() => ({ data: { values: [] as string[][] } }));
    const rows = res.data.values || [];

    const stale = rows.filter((row) => {
      const called = row[calledIdx];
      const outcome = row[outcomeIdx];
      if (called === true || called === "TRUE" || (outcome && String(outcome).trim())) return false;
      const d = parseSheetDate(String(row[dateIdx] || ""));
      return d ? d.getTime() <= cutoff : false;
    });

    if (stale.length === 0) continue;

    const rowsHtml = stale
      .map((row) => `<li>${row[nameIdx] || "Unknown"}${row[detailsIdx] ? ` — ${row[detailsIdx]}` : ""}</li>`)
      .join("");
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;max-width:560px;">
  <p style="margin:0 0 12px">Quick check — these leads have come through but there's no update yet, what's the go with them?</p>
  <ul style="margin:0 0 16px;padding-left:20px">${rowsHtml}</ul>
</div>`;

    try {
      await sendClientEmail(email as string, "Quick check — any update on these leads?", html);
      sentCount++;
    } catch {
      continue;
    }
  }

  return { sent: sentCount };
}
