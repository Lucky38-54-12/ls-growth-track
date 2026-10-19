import { createSupabaseClient, fetchAllRows } from "./supabase";
import { notifySlack } from "./slackNotify";
import { LeadStatus } from "./types";

// A campaign lead can sit in an indefinite monthly check-in loop after
// finishing the scripted initial/followup1-4 sequence (see
// DAYS_CAMPAIGN_CHECKIN in lib/leads.ts) — that's intentional nurture, not
// something worth waiting on. "Completed" here means the one-time scripted
// sequence has run its course for every lead in the campaign: either it
// ended in an outcome (replied/booked/not_interested/bounced) or it
// exhausted all 4 follow-ups with no reply (sequence_complete).
const SEQUENCE_DONE_STATUSES = new Set<LeadStatus>([
  "replied",
  "booked",
  "not_interested",
  "bounced",
  "sequence_complete",
]);

// Flips a finished active campaign to "completed" and pings Slack once,
// instead of it sitting marked "active" forever with nothing left to send —
// the only way anyone would otherwise notice is manually checking lead
// statuses one by one. Re-running this is safe: once a campaign's status
// flips to "completed" it drops out of the `eq("status", "active")` filter,
// so the Slack ping only ever fires the one time.
export async function checkCampaignCompletions(
  sb: ReturnType<typeof createSupabaseClient>
): Promise<{ completed: string[] }> {
  const { data: activeCampaigns } = await sb.from("campaigns").select("id, name").eq("status", "active");
  const completed: string[] = [];

  for (const campaign of activeCampaigns || []) {
    const leads = await fetchAllRows<{ status: LeadStatus }>((from, to) =>
      sb.from("leads").select("status").eq("campaign_id", campaign.id).range(from, to)
    );
    if (leads.length === 0) continue;

    const allDone = leads.every((l) => SEQUENCE_DONE_STATUSES.has(l.status));
    if (!allDone) continue;

    const counts: Record<string, number> = {};
    for (const l of leads) counts[l.status] = (counts[l.status] || 0) + 1;

    await sb.from("campaigns").update({ status: "completed" }).eq("id", campaign.id);
    completed.push(campaign.name);

    const summaryLine = Object.entries(counts).map(([status, n]) => `${n} ${status}`).join(", ");
    await notifySlack(
      `🏁 Campaign *${campaign.name}* has finished its outreach sequence for all ${leads.length} leads: ${summaryLine}.\n` +
      `${process.env.APP_URL || "https://app.lsgrowth.agency"}/dashboard/campaigns`
    );
  }

  return { completed };
}
