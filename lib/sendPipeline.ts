import { createSupabaseClient } from "./supabase";
import { nextStepFor, STEP_NEW_STATUS } from "./leads";
import { sendOutreachEmail, sendPersonalizedEmail } from "./email";
import { generateCampaignStepEmail, generatePersonalizationHook } from "./ai";
import { Lead } from "./types";

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

// Shared by /api/send (manual trigger) and /api/cron (scheduled, currently
// off) so the two never drift out of sync with each other again.
export async function sendNextStepFor(lead: Lead, sb: SupabaseClient): Promise<{ sent: boolean }> {
  const step = nextStepFor(lead);
  if (!step) return { sent: false };

  if (lead.campaign_id) {
    // Research only ever ran at sheet-import time (lib/sheetSync.ts) — leads
    // that arrive any other way (scraper, manual entry) reach send-time with
    // no personalization_hook. Best-effort enrich here so every campaign
    // lead gets a real, researched email instead of the generic fallback.
    if (!lead.personalization_hook && (lead.website || lead.facebook)) {
      try {
        const { hook, contactName } = await generatePersonalizationHook({
          company: lead.company,
          trade: lead.trade,
          location: lead.location,
          website: lead.website,
          facebook: lead.facebook,
          notes: lead.notes,
        });
        lead.personalization_hook = hook;
        const update: Record<string, unknown> = { personalization_hook: hook };
        if (contactName && (!lead.contact_name || lead.contact_name === "there")) {
          lead.contact_name = contactName;
          update.contact_name = contactName;
        }
        await sb.from("leads").update(update).eq("lead_id", lead.lead_id);
      } catch {
        // leave personalization_hook null — generateCampaignStepEmail falls back to a generic email
      }
    }

    const { data: priorSends } = await sb
      .from("email_sends")
      .select("subject")
      .eq("lead_id", lead.lead_id)
      .order("sent_at", { ascending: true });
    const { subject, bodyHtml } = await generateCampaignStepEmail({
      company: lead.company,
      contactName: lead.contact_name,
      trade: lead.trade,
      location: lead.location,
      notes: lead.notes,
      website: lead.website,
      personalizationHook: lead.personalization_hook,
      step,
      priorSubjects: (priorSends || []).map((s) => s.subject as string),
    });
    await sendPersonalizedEmail(lead, subject, bodyHtml, step);
  } else if (step === "checkin") {
    // Never happens — checkin is only returned for campaign leads — but
    // satisfies the type checker without an unsafe cast.
    return { sent: false };
  } else {
    await sendOutreachEmail(lead, step);
  }

  const today = new Date().toISOString().split("T")[0];
  const update: Record<string, unknown> = { status: STEP_NEW_STATUS[step] };
  if (step === "initial") {
    update.date_contacted = today;
  } else {
    update.last_followup = today;
    update.followup_count = (lead.followup_count || 0) + 1;
  }
  await sb.from("leads").update(update).eq("lead_id", lead.lead_id);

  return { sent: true };
}
