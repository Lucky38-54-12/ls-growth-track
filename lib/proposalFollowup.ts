import { createSupabaseClient, fetchAllRows } from "./supabase";
import { sendPersonalizedEmail, sendGmailFollowup } from "./email";
import { generateCallFollowupEmail } from "./generateCallEmail";
import { checkEmailQuality } from "./ai";
import { notifySlack } from "./slackNotify";
import { Lead } from "./types";

const DAYS_BEFORE_NUDGE = 5;

// A proposal that's gone quiet still needs a nudge — same AI-drafted +
// quality-checked + auto-sent pattern as the cold-outreach sequence
// (lib/sendPipeline.ts), scoped to leads sitting in "proposal_sent" past
// DAYS_BEFORE_NUDGE with no reply. proposal_followup_sent guarantees this
// only ever fires once per proposal (see statusTimestampUpdates in
// lib/leads.ts, which resets it whenever a lead freshly re-enters
// "proposal_sent").
export async function sendDueProposalFollowups(): Promise<{ sent: number; held: number }> {
  const sb = createSupabaseClient();
  const cutoff = new Date(Date.now() - DAYS_BEFORE_NUDGE * 24 * 60 * 60 * 1000).toISOString();

  const leads = await fetchAllRows<Lead>((from, to) =>
    sb.from("leads")
      .select("*")
      .eq("status", "proposal_sent")
      .eq("proposal_followup_sent", false)
      .lte("proposal_sent_at", cutoff)
      .not("email", "is", null)
      .range(from, to)
  );

  let sent = 0;
  let held = 0;

  for (const lead of leads) {
    // Same manual hold as lib/sendPipeline.ts — no automated send of any
    // kind goes to cleaning-trade leads until Lucky says otherwise.
    if (lead.trade?.toLowerCase().includes("clean")) continue;

    try {
      const generated = await generateCallFollowupEmail(
        lead,
        "It's been about a week since the proposal went out with no reply yet. Write a short, low-pressure check-in — ask if they've had a chance to look it over or if they have any questions, don't re-pitch or re-explain the offer."
      );
      if (!generated) continue;

      const quality = await checkEmailQuality({
        subject: generated.subject,
        bodyHtml: generated.bodyHtml,
        step: "cold_call_followup",
        contactName: lead.contact_name,
        notes: lead.notes,
        requireCtaPlaceholder: false,
      });

      await sb.from("email_checks").insert({
        lead_id: lead.lead_id,
        step: "cold_call_followup",
        subject: generated.subject,
        body_html: generated.bodyHtml,
        verdict: quality.verdict,
        mechanical_fails: quality.mechanicalFails,
        judgment_flags: quality.judgmentFlags,
        reasoning: quality.reasoning,
        sent: quality.verdict === "approved",
      });

      if (quality.verdict === "rejected") {
        held++;
        await notifySlack(
          `🛑 Held proposal follow-up for *${lead.company}* — quality check rejected it.\n` +
          `Reason: ${quality.reasoning || quality.mechanicalFails?.[0] || quality.judgmentFlags?.[0] || "no reason given"}\n` +
          `${process.env.APP_URL || "https://app.lsgrowth.agency"}/dashboard/leads/${lead.lead_id}`
        );
        // Don't mark proposal_followup_sent — leave it to retry next run
        // once the underlying issue (e.g. missing website data) is fixed.
        continue;
      }

      const sendFn = lead.source === "cold_call" ? sendGmailFollowup : sendPersonalizedEmail;
      await sendFn(lead, generated.subject, generated.bodyHtml);

      const today = new Date().toISOString().split("T")[0];
      await sb.from("leads").update({
        proposal_followup_sent: true,
        last_followup: today,
        followup_count: (lead.followup_count || 0) + 1,
      }).eq("lead_id", lead.lead_id);

      sent++;
    } catch (e) {
      await notifySlack(`⚠️ Proposal follow-up failed for *${lead.company}*: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  return { sent, held };
}
