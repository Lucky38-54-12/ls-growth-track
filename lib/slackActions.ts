import { createSupabaseClient } from "./supabase";
import { sendNextStepFor } from "./sendPipeline";
import { Lead } from "./types";

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

export async function resolveLead(sb: SupabaseClient, ref: string): Promise<Lead | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  const byId = await sb.from("leads").select("*").eq("lead_id", trimmed).maybeSingle();
  if (byId.data) return byId.data as Lead;

  const byEmail = await sb.from("leads").select("*").ilike("email", trimmed).maybeSingle();
  return (byEmail.data as Lead) ?? null;
}

export async function markLeadReplied(leadRef: string): Promise<string> {
  const sb = createSupabaseClient();
  const lead = await resolveLead(sb, leadRef);
  if (!lead) return `Couldn't find a lead matching "${leadRef}" — reply with the lead_id or email from the report.`;

  if (lead.status === "replied" || lead.status === "booked") {
    return `${lead.company} (${lead.lead_id}) is already marked "${lead.status}" — no change made.`;
  }

  const { error } = await sb.from("leads").update({ status: "replied" }).eq("lead_id", lead.lead_id);
  if (error) return `Failed to update ${lead.lead_id}: ${error.message}`;
  return `Marked ${lead.company} (${lead.lead_id}) as replied — no further campaign emails will go out to them.`;
}

export async function retrySend(leadRef: string): Promise<string> {
  const sb = createSupabaseClient();
  const lead = await resolveLead(sb, leadRef);
  if (!lead) return `Couldn't find a lead matching "${leadRef}" — reply with the lead_id or email from the report.`;

  try {
    const result = await sendNextStepFor(lead, sb);
    if (result.sent) return `Sent the next email to ${lead.company} (${lead.lead_id}).`;
    if (result.held) return `Regenerated the email for ${lead.company} (${lead.lead_id}), but it was held again by the quality check.`;
    return `Nothing to send for ${lead.company} (${lead.lead_id}) right now — no campaign assigned or no step due.`;
  } catch (e) {
    return `Error retrying send for ${lead.lead_id}: ${e instanceof Error ? e.message : "unknown error"}`;
  }
}
