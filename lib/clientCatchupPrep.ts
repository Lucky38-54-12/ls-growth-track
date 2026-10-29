import { google } from "googleapis";
import { createSupabaseClient } from "./supabase";
import { sendClientEmail } from "./email";
import { getLuckyGoogleAuthedClient } from "./luckyGoogleAuth";
import { TARGET_HEADER } from "./metaLeadsSheetSync";
import { reportAutomationStatus } from "./automationStatus";

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

const CATCHUP_INTERVAL_DAYS = 14;

interface LeadSheetSync {
  id: string;
  client_name: string;
  spreadsheet_id: string;
  target_tab: string;
  last_catchup_prep_sent_at: string | null;
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
    // Date() despite not being ISO, good enough for a bucket count.
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

// Internal prep notes for Lucky's own biweekly face-to-face catch-ups with
// clients — NOT sent to clients (see lib/weeklyCheckin.ts for the
// client-facing nudge, a different thing). Each client gets checked once a
// day for whether it's been >= CATCHUP_INTERVAL_DAYS since their last prep
// email; due clients are batched into one email to Lucky himself so a call
// coming up tomorrow doesn't wait on a fixed day-of-month/week slot. Pulled
// the automated client-facing recap this replaced — Lucky wants numbers in
// person at the catch-up, not a cold email (2026-10-30).
export async function sendClientCatchupPrepIfDue(sb: SupabaseClient): Promise<{ sent: number; clients: string[] } | { sent: false }> {
  const { data: syncs } = await sb
    .from("lead_sheet_syncs")
    .select("id, client_name, spreadsheet_id, target_tab, last_catchup_prep_sent_at");

  if (!syncs || syncs.length === 0) return { sent: false };

  const now = Date.now();
  const due = (syncs as LeadSheetSync[]).filter((s) => {
    if (!s.last_catchup_prep_sent_at) return true;
    const daysSince = (now - new Date(s.last_catchup_prep_sent_at).getTime()) / (24 * 60 * 60 * 1000);
    return daysSince >= CATCHUP_INTERVAL_DAYS;
  });

  if (due.length === 0) return { sent: 0, clients: [] };

  const since = new Date(now - CATCHUP_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  const sections: string[] = [];
  const processed: string[] = [];

  for (const s of due) {
    try {
      const sheetStats = await getSheetStatsSince(s.spreadsheet_id, s.target_tab, since);
      const reviewStats = await getReviewFunnelStatsSince(sb, s.spreadsheet_id, since.toISOString());

      const rows: string[] = [
        `<tr><td style="padding:4px 16px 4px 0;color:#64748b">New leads</td><td style="padding:4px 0;font-weight:700">${sheetStats.newLeads}</td></tr>`,
        `<tr><td style="padding:4px 16px 4px 0;color:#64748b">Booked</td><td style="padding:4px 0;font-weight:700">${sheetStats.booked}</td></tr>`,
      ];
      if (reviewStats) {
        rows.push(
          `<tr><td style="padding:4px 16px 4px 0;color:#64748b">Reviews landed</td><td style="padding:4px 0;font-weight:700">${reviewStats.good}</td></tr>`,
          `<tr><td style="padding:4px 16px 4px 0;color:#64748b">Caught privately</td><td style="padding:4px 0;font-weight:700">${reviewStats.caughtPrivately}</td></tr>`,
          `<tr><td style="padding:4px 16px 4px 0;color:#64748b">Referrals</td><td style="padding:4px 0;font-weight:700">${reviewStats.referrals}</td></tr>`
        );
      }

      sections.push(`<h3 style="margin:18px 0 6px;font-size:15px">${s.client_name}</h3><table style="border-collapse:collapse;font-size:14px">${rows.join("")}</table>`);
      processed.push(s.id);
    } catch (e) {
      console.error("client catch-up prep failed for", s.client_name, e);
    }
  }

  if (sections.length === 0) return { sent: 0, clients: [] };

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;max-width:480px;">
  <p style="margin:0 0 4px">Due for a catch-up (last ${CATCHUP_INTERVAL_DAYS} days):</p>
  ${sections.join("")}
</div>`;

  const clientNames = due.filter((s) => processed.includes(s.id)).map((s) => s.client_name);
  // GMAIL_USER is Lucky's real inbox (see lib/email.ts) — lands as prep
  // notes to check before each face-to-face, not a client-facing send.
  await sendClientEmail(process.env.GMAIL_USER as string, `Catch-up prep: ${clientNames.join(", ")}`, html);

  await sb.from("lead_sheet_syncs").update({ last_catchup_prep_sent_at: new Date().toISOString() }).in("id", processed);
  await reportAutomationStatus(sb, "client-catchup-prep", "ok", `Sent prep for ${processed.length} client(s): ${clientNames.join(", ")}`);

  return { sent: processed.length, clients: clientNames };
}
