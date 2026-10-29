import { google } from "googleapis";
import { createSupabaseClient } from "./supabase";
import { sendClientEmail } from "./email";
import { getLuckyGoogleAuthedClient } from "./luckyGoogleAuth";
import { TARGET_HEADER } from "./metaLeadsSheetSync";
import { reportAutomationStatus } from "./automationStatus";

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

// Two fixed check-ins a month with each client, not a rolling per-client
// timer (reworked 2026-10-30 after Lucky described his actual routine):
// mid-month he reviews the sheet together with the client and chases
// whatever's gone stale; end-of-month he shows them results. Both land as
// one email to Lucky himself — prep notes for a face-to-face, never sent to
// the client directly (see lib/weeklyCheckin.ts for the client-facing nudge,
// a different thing).
const MID_MONTH_DAY = 15;
const END_OF_MONTH_DAY = 28;
const RESULTS_LOOKBACK_DAYS = 30;

function nzDayOfMonth(): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", day: "numeric" }).format(new Date()));
}

interface LeadSheetSync {
  id: string;
  client_name: string;
  spreadsheet_id: string;
  target_tab: string;
}

type SheetRow = (string | boolean)[];

async function getSheetRows(spreadsheetId: string, targetTab: string): Promise<SheetRow[]> {
  const auth = await getLuckyGoogleAuthedClient();
  const sheets = google.sheets({ version: "v4", auth });
  const lastCol = String.fromCharCode(65 + TARGET_HEADER.length - 1);
  const res = await sheets.spreadsheets.values
    .get({ spreadsheetId, range: `'${targetTab}'!A2:${lastCol}` })
    .catch(() => ({ data: { values: [] } }));
  return (res.data.values || []) as SheetRow[];
}

// Mid-month: what's sitting unresolved — hasn't been called, or was called
// but has no Outcome logged yet. This is what the sheet itself already
// shows (see Lucky's own comment: "if they haven't filled it in"), just
// surfaced ahead of time instead of him finding it live in the meeting.
export async function sendMidMonthCheckinPrepIfDue(sb: SupabaseClient): Promise<{ sent: boolean }> {
  if (nzDayOfMonth() !== MID_MONTH_DAY) return { sent: false };

  const { data: syncs } = await sb.from("lead_sheet_syncs").select("id, client_name, spreadsheet_id, target_tab");
  if (!syncs || syncs.length === 0) return { sent: false };

  const nameIdx = TARGET_HEADER.indexOf("Name");
  const phoneIdx = TARGET_HEADER.indexOf("Phone");
  const calledIdx = TARGET_HEADER.indexOf("Called?");
  const outcomeIdx = TARGET_HEADER.indexOf("Outcome");

  const sections: string[] = [];
  for (const s of syncs as LeadSheetSync[]) {
    try {
      const rows = await getSheetRows(s.spreadsheet_id, s.target_tab);
      const unresolved = rows.filter((row) => {
        const called = row[calledIdx] === true || row[calledIdx] === "TRUE";
        return !called || !row[outcomeIdx];
      });
      if (unresolved.length === 0) continue;

      const listed = unresolved.slice(0, 10).map((row) => `<li>${row[nameIdx] || "Unknown"}${row[phoneIdx] ? ` — ${row[phoneIdx]}` : ""}</li>`).join("");
      const more = unresolved.length > 10 ? `<p style="margin:4px 0 0;color:#6b7280;font-size:13px">+ ${unresolved.length - 10} more</p>` : "";
      sections.push(`<h3 style="margin:18px 0 6px;font-size:15px">${s.client_name} (${unresolved.length} unresolved)</h3><ul style="margin:0;padding-left:18px">${listed}</ul>${more}`);
    } catch (e) {
      console.error("mid-month check-in prep failed for", s.client_name, e);
    }
  }

  if (sections.length === 0) return { sent: false };

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;max-width:480px;">
  <p style="margin:0 0 4px">Mid-month check-in — leads not called yet, or called with no outcome logged:</p>
  ${sections.join("")}
</div>`;

  await sendClientEmail(process.env.GMAIL_USER as string, "Mid-month check-in prep", html);
  await reportAutomationStatus(sb, "mid-month-checkin-prep", "ok", `Flagged unresolved leads for ${sections.length} client(s)`);
  return { sent: true };
}

interface SheetStats {
  newLeads: number;
  booked: number;
}

function getSheetStatsSince(rows: SheetRow[], since: Date): SheetStats {
  const dateIdx = TARGET_HEADER.indexOf("Date");
  const outcomeIdx = TARGET_HEADER.indexOf("Outcome");
  let newLeads = 0;
  let booked = 0;
  for (const row of rows) {
    // Date is stored pre-formatted for display (formatDate in
    // metaLeadsSheetSync.ts), e.g. "27 Oct 2026, 3:45 PM" — re-parseable by
    // Date() despite not being ISO, good enough for a bucket count.
    const dateCell = row[dateIdx];
    const d = typeof dateCell === "string" && dateCell ? new Date(dateCell) : null;
    if (!d || isNaN(d.getTime()) || d < since) continue;
    newLeads++;
    if (row[outcomeIdx] === "Booked") booked++;
  }
  return { newLeads, booked };
}

interface ReviewFunnelStats {
  requested: number;
  good: number;
  caughtPrivately: number;
  referrals: number;
}

async function getReviewFunnelStatsSince(sb: SupabaseClient, spreadsheetId: string, since: string): Promise<ReviewFunnelStats | null> {
  const { data: client } = await sb.from("review_funnel_clients").select("id").eq("spreadsheet_id", spreadsheetId).maybeSingle();
  if (!client) return null;

  const [{ count: requested }, { count: good }, { count: bad }, { count: referrals }] = await Promise.all([
    sb.from("review_funnel_sends").select("id", { count: "exact", head: true }).eq("review_funnel_client_id", client.id).gte("sent_at", since),
    sb.from("review_funnel_responses").select("id", { count: "exact", head: true }).eq("review_funnel_client_id", client.id).eq("sentiment", "good").gte("created_at", since),
    sb.from("review_funnel_responses").select("id", { count: "exact", head: true }).eq("review_funnel_client_id", client.id).eq("sentiment", "bad").gte("created_at", since),
    sb.from("review_funnel_referrals").select("id", { count: "exact", head: true }).eq("review_funnel_client_id", client.id).gte("created_at", since),
  ]);

  return { requested: requested || 0, good: good || 0, caughtPrivately: bad || 0, referrals: referrals || 0 };
}

// End-of-month: the results to walk each client through — how much work
// they got out of this.
export async function sendEndOfMonthResultsPrepIfDue(sb: SupabaseClient): Promise<{ sent: boolean }> {
  if (nzDayOfMonth() !== END_OF_MONTH_DAY) return { sent: false };

  const { data: syncs } = await sb.from("lead_sheet_syncs").select("id, client_name, spreadsheet_id, target_tab");
  if (!syncs || syncs.length === 0) return { sent: false };

  const since = new Date(Date.now() - RESULTS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const sections: string[] = [];

  for (const s of syncs as LeadSheetSync[]) {
    try {
      const rows = await getSheetRows(s.spreadsheet_id, s.target_tab);
      const sheetStats = getSheetStatsSince(rows, since);
      const reviewStats = await getReviewFunnelStatsSince(sb, s.spreadsheet_id, since.toISOString());

      const statRows: string[] = [
        `<tr><td style="padding:4px 16px 4px 0;color:#64748b">New leads</td><td style="padding:4px 0;font-weight:700">${sheetStats.newLeads}</td></tr>`,
        `<tr><td style="padding:4px 16px 4px 0;color:#64748b">Booked</td><td style="padding:4px 0;font-weight:700">${sheetStats.booked}</td></tr>`,
      ];
      if (reviewStats) {
        statRows.push(
          `<tr><td style="padding:4px 16px 4px 0;color:#64748b">Reviews landed</td><td style="padding:4px 0;font-weight:700">${reviewStats.good}</td></tr>`,
          `<tr><td style="padding:4px 16px 4px 0;color:#64748b">Caught privately</td><td style="padding:4px 0;font-weight:700">${reviewStats.caughtPrivately}</td></tr>`,
          `<tr><td style="padding:4px 16px 4px 0;color:#64748b">Referrals</td><td style="padding:4px 0;font-weight:700">${reviewStats.referrals}</td></tr>`
        );
      }

      sections.push(`<h3 style="margin:18px 0 6px;font-size:15px">${s.client_name}</h3><table style="border-collapse:collapse;font-size:14px">${statRows.join("")}</table>`);
    } catch (e) {
      console.error("end-of-month results prep failed for", s.client_name, e);
    }
  }

  if (sections.length === 0) return { sent: false };

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;max-width:480px;">
  <p style="margin:0 0 4px">End-of-month results, to show each client:</p>
  ${sections.join("")}
</div>`;

  await sendClientEmail(process.env.GMAIL_USER as string, "End-of-month results prep", html);
  await reportAutomationStatus(sb, "end-of-month-results-prep", "ok", `Compiled results for ${sections.length} client(s)`);
  return { sent: true };
}
