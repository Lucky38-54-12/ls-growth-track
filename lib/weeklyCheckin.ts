import { createSupabaseClient } from "./supabase";
import { sendClientEmail } from "./email";
import { notifySlack } from "./slackNotify";
import { createCheckinToken } from "./checkinPortalAuth";
import { getOutcomesByLeadId } from "./metaLeadsSheetSync";

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.lsgrowth.agency";
const CHECKIN_WEEKDAY = 1; // Monday (UTC), same slot as the internal weekly digest
const LOOKBACK_DAYS = 21; // keep nudging an unanswered lead for up to 3 weeks
const STALE_AFTER_NUDGES = 2;

interface PendingLead {
  id: string;
  client_id: string;
  contact_email: string | null;
  pipeline_stage: string | null;
  checkin_nudges_sent: number;
  created_at: string;
  lq_conversations: { extracted_fields: Record<string, unknown>; contact: Record<string, unknown> } | null;
}

// Weekly batch instead of per-lead nudges — one email per client listing
// every qualified lead with no reported outcome yet, with a tap-through link
// (lib/checkinPortalAuth.ts) instead of asking them to keep a shared sheet
// updated, which in practice never happened.
export async function sendWeeklyCheckinIfDue(sb: SupabaseClient): Promise<{ sent: number; flagged: number } | { sent: false }> {
  if (new Date().getUTCDay() !== CHECKIN_WEEKDAY) return { sent: false };

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Builders only, not cleaning — a renovation/new-build lead resolves to a
  // single priced job, which is what "won + $ value" is modelling. A cleaning
  // client's leads turn into an ongoing contract, not a one-off job, so this
  // check-in doesn't fit them yet.
  const { data: clients } = await sb.from("lq_clients").select("id, name, email, trade").eq("status", "active").not("email", "is", null);
  const builderClients = (clients || []).filter((c) => !String(c.trade || "").toLowerCase().includes("clean"));
  if (builderClients.length === 0) return { sent: 0, flagged: 0 };

  let sentCount = 0;
  let flaggedCount = 0;

  for (const client of builderClients) {
    const { data: leads } = await sb
      .from("lq_leads")
      .select("id, client_id, contact_email, pipeline_stage, checkin_nudges_sent, created_at, lq_conversations(extracted_fields, contact)")
      .eq("client_id", client.id)
      .eq("outcome", "qualified")
      .is("job_won_at", null)
      .is("job_lost_reason", null)
      .neq("pipeline_stage", "not_a_fit")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    let pending = (leads || []) as unknown as PendingLead[];
    if (pending.length === 0) continue;

    // If this client has a tracked Meta Lead Ads call sheet, skip anything
    // already logged with an Outcome there — no point asking the client too
    // once Lucky's own sheet already shows what happened on the call.
    const { data: sheetSync } = await sb.from("lead_sheet_syncs").select("spreadsheet_id, target_tab").eq("client_name", client.name).maybeSingle();
    if (sheetSync) {
      const outcomesByLeadId = await getOutcomesByLeadId(sheetSync.spreadsheet_id, sheetSync.target_tab).catch(() => null);
      if (outcomesByLeadId) {
        pending = pending.filter((lead) => {
          const leadgenId = String(lead.lq_conversations?.contact?.leadgen_id || "");
          if (!leadgenId) return true; // not a Meta Lead Ads lead, not tracked on the sheet at all
          const outcome = outcomesByLeadId.get(leadgenId);
          return !outcome; // blank (or no row at all) — still worth asking about
        });
      }
    }
    if (pending.length === 0) continue;

    const token = await createCheckinToken(client.id);
    const checkinUrl = `${APP_URL}/portal/checkin/${token}`;

    const rows = pending
      .map((lead) => {
        const fields = lead.lq_conversations?.extracted_fields || {};
        const name = String(fields.name || lead.contact_email || "Unknown");
        const jobType = String(fields.job_type || "");
        return `<li>${name}${jobType ? ` — ${jobType}` : ""}</li>`;
      })
      .join("");

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;max-width:560px;">
  <p style="margin:0 0 12px">Quick one — did any of these turn into jobs?</p>
  <ul style="margin:0 0 16px;padding-left:20px">${rows}</ul>
  <p style="margin:0 0 16px"><a href="${checkinUrl}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">Tap through them here</a></p>
  <p style="margin:0;color:#6b7280;font-size:13px">Takes less than a minute — won/lost/still talking, no typing needed.</p>
</div>`;

    try {
      await sendClientEmail(client.email as string, "Quick one — did these turn into jobs?", html);
      sentCount++;
    } catch {
      continue; // don't bump nudge counts for leads that never actually got emailed
    }

    const staleLeads = pending.filter((l) => l.checkin_nudges_sent + 1 >= STALE_AFTER_NUDGES);

    for (const lead of pending) {
      await sb.from("lq_leads").update({ checkin_nudges_sent: lead.checkin_nudges_sent + 1 }).eq("id", lead.id);
    }

    if (staleLeads.length > 0) {
      flaggedCount += staleLeads.length;
      await notifySlack(
        `🟡 ${staleLeads.length} lead(s) for *${client.name}* have gone ${STALE_AFTER_NUDGES} weekly check-ins with no outcome reported — worth a direct ask:\n` +
        staleLeads.map((l) => {
          const fields = l.lq_conversations?.extracted_fields || {};
          return `• ${String(fields.name || l.contact_email || "Unknown")} (booked ${new Date(l.created_at).toLocaleDateString()})`;
        }).join("\n")
      );
    }
  }

  return { sent: sentCount, flagged: flaggedCount };
}
