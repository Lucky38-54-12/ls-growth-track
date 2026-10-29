import { google } from "googleapis";
import { createSupabaseClient } from "./supabase";
import { sendClientEmail } from "./email";
import { getLuckyGoogleAuthedClient } from "./luckyGoogleAuth";
import { TARGET_HEADER } from "./metaLeadsSheetSync";
import { reportAutomationStatus } from "./automationStatus";

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

const RECAP_DAY_OF_MONTH = 1; // NZT, matches daily-maintenance's own once-a-day dedupe — see route.ts
const LOOKBACK_DAYS = 30;

interface LeadSheetSync {
  id: string;
  client_name: string;
  client_email: string | null;
  spreadsheet_id: string;
  target_tab: string;
}

interface SheetStats {
  newLeads: number;
  booked: number;
}

async function getSheetStatsSince(spreadsheetId: string, targetTab: string, since: Date): Promise<SheetStats> {
  const auth = await getLuckyGoogleAuthedClient();
  const sheets = google.sheets({ version: "v4", auth });

  const lastCol = String.fromCharCode(65 + TARGET_HEADER.length - 1);
  const res = await sheets.spreadsheets.values
    .get({ spreadsheetId, range: `'${targetTab}'!A2:${lastCol}` })
    .catch(() => ({ data: { values: [] } }));

  const dateIdx = TARGET_HEADER.indexOf("Date");
  const outcomeIdx = TARGET_HEADER.indexOf("Outcome");

  const rows = res.data.values || [];
  let newLeads = 0;
  let booked = 0;
  for (const row of rows) {
    // Date is stored pre-formatted for display (formatDate in
    // metaLeadsSheetSync.ts), e.g. "27 Oct 2026, 3:45 PM" — re-parseable by
    // Date() despite not being ISO, good enough for a month-bucket count.
    const d = row[dateIdx] ? new Date(row[dateIdx]) : null;
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

// Monthly recap email per client with leads/Meta data tracked — "here's what
// happened last month," built entirely from data already captured (the
// leads sheet + review-funnel tables), no new tracking required. Fires once
// a month (gated on day-of-month, relying on daily-maintenance's own
// once-per-day dedupe above it to never double-send) rather than a per-client
// anniversary date — simpler, and everyone's used to a start-of-month recap.
export async function sendMonthlyRecapIfDue(sb: SupabaseClient): Promise<{ sent: number } | { sent: false }> {
  const nzToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", day: "numeric" }).format(new Date());
  if (Number(nzToday) !== RECAP_DAY_OF_MONTH) return { sent: false };

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const monthLabel = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", month: "long" }).format(since);

  const { data: syncs } = await sb
    .from("lead_sheet_syncs")
    .select("id, client_name, client_email, spreadsheet_id, target_tab")
    .not("client_email", "is", null);

  if (!syncs || syncs.length === 0) return { sent: 0 };

  let sentCount = 0;
  for (const s of syncs as LeadSheetSync[]) {
    try {
      const sheetStats = await getSheetStatsSince(s.spreadsheet_id, s.target_tab, since);
      const reviewStats = await getReviewFunnelStatsSince(sb, s.spreadsheet_id, since.toISOString());

      const rows: string[] = [
        `<tr><td style="padding:6px 16px 6px 0;color:#64748b">New leads</td><td style="padding:6px 0;font-weight:700">${sheetStats.newLeads}</td></tr>`,
        `<tr><td style="padding:6px 16px 6px 0;color:#64748b">Booked</td><td style="padding:6px 0;font-weight:700">${sheetStats.booked}</td></tr>`,
      ];
      if (reviewStats) {
        rows.push(
          `<tr><td style="padding:6px 16px 6px 0;color:#64748b">Reviews landed</td><td style="padding:6px 0;font-weight:700">${reviewStats.good}</td></tr>`,
          `<tr><td style="padding:6px 16px 6px 0;color:#64748b">Caught privately before going public</td><td style="padding:6px 0;font-weight:700">${reviewStats.caughtPrivately}</td></tr>`,
          `<tr><td style="padding:6px 16px 6px 0;color:#64748b">Referrals</td><td style="padding:6px 0;font-weight:700">${reviewStats.referrals}</td></tr>`
        );
      }

      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;max-width:480px;">
  <p style="margin:0 0 14px">Hey ${s.client_name}, here's how ${monthLabel} went:</p>
  <table style="border-collapse:collapse;font-size:14px;margin:0 0 16px">${rows.join("")}</table>
  <p style="margin:0;color:#6b7280;font-size:13px">Cheers,<br>Lucky<br>LS Growth</p>
</div>`;

      await sendClientEmail(s.client_email as string, `Your ${monthLabel} recap`, html);
      sentCount++;
    } catch (e) {
      console.error("monthly recap failed for", s.client_name, e);
    }
  }

  await reportAutomationStatus(sb, "monthly-recap", "ok", `Sent ${sentCount} recap email(s)`);
  return { sent: sentCount };
}
