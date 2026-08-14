import { createSupabaseClient, fetchAllRows } from "./supabase";
import { sendGmailFollowup } from "./email";
import { generateCallFollowupEmail } from "./generateCallEmail";
import { checkEmailQuality } from "./ai";
import { notifySlack } from "./slackNotify";
import { Lead } from "./types";

// A week-long, three-touch nudge sequence for leads that no-showed a booked
// meeting — same AI-drafted + quality-checked + auto-sent pattern as
// coldCallNudges.ts and proposalFollowup.ts. After the third touch it stops
// completely (no_show_sequence_step reaches 3) so Lucky can call them back
// himself without the automation still chasing in the background. Status
// stays "no_show" for the whole sequence — only no_show_sequence_step and
// no_show_last_sent_at track progress, so this never collides with the
// cold-call thinking_about_it nudge cadence, which drives off `status`.
const DAYS_STEP_1 = 1; // first check-in, next day
const DAYS_STEP_2 = 3; // days after step 1
const DAYS_STEP_3 = 3; // days after step 2 (day 7 overall)

export const NO_SHOW_STEP_GAP_DAYS = [DAYS_STEP_1, DAYS_STEP_2, DAYS_STEP_3];

const STEP_INSTRUCTIONS = [
  "They booked a call/meeting but didn't show up and haven't been in touch since. Write a short, friendly \"hey, we missed each other\" check-in — no guilt-tripping, just ask if they'd like to find another time.",
  "This is the second check-in after a missed meeting with still no reply. Write a short, low-pressure nudge — acknowledge things get busy, ask if it's still worth finding a time, keep it brief.",
  "This is the third and final check-in after a missed meeting with no reply to two previous messages. Write a short, genuinely low-pressure close-out — say you'll leave it here for now and they're welcome to reach out whenever suits, don't push.",
];

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  return Math.floor((Date.now() - then.getTime()) / (1000 * 60 * 60 * 24));
}

async function sendStep(sb: ReturnType<typeof createSupabaseClient>, lead: Lead, stepIndex: number): Promise<boolean> {
  const generated = await generateCallFollowupEmail(lead, STEP_INSTRUCTIONS[stepIndex]);
  if (!generated) return false;

  const quality = await checkEmailQuality({
    subject: generated.subject,
    bodyHtml: generated.bodyHtml,
    // No dedicated quality-check tuning for no-show follow-ups — they're the
    // same low-pressure check-in style as cold-call nudges, so reuse that
    // step's bar. The email_checks row and Gmail send below still use the
    // "no_show_followup" label so they're identifiable in their own right.
    step: "cold_call_followup",
    contactName: lead.contact_name,
    notes: lead.notes,
    requireCtaPlaceholder: false,
  });

  await sb.from("email_checks").insert({
    lead_id: lead.lead_id,
    step: "no_show_followup",
    subject: generated.subject,
    body_html: generated.bodyHtml,
    verdict: quality.verdict,
    mechanical_fails: quality.mechanicalFails,
    judgment_flags: quality.judgmentFlags,
    reasoning: quality.reasoning,
    sent: quality.verdict === "approved",
  });

  if (quality.verdict === "rejected") {
    await notifySlack(
      `🛑 Held no-show follow-up for *${lead.company}* — quality check rejected it.\n` +
      `Reason: ${quality.reasoning || quality.mechanicalFails?.[0] || quality.judgmentFlags?.[0] || "no reason given"}\n` +
      `${process.env.APP_URL || "https://app.lsgrowth.agency"}/dashboard/leads/${lead.lead_id}`
    );
    // Leave the step as-is so it retries next run once the issue is fixed.
    return false;
  }

  await sendGmailFollowup(lead, generated.subject, generated.bodyHtml, "no_show_followup");

  await sb.from("leads").update({
    no_show_sequence_step: stepIndex + 1,
    no_show_last_sent_at: new Date().toISOString(),
  }).eq("lead_id", lead.lead_id);

  return true;
}

export async function sendDueNoShowFollowups(): Promise<{ sent: number; held: number }> {
  // Hard kill switch (2026-08-14) — same flag as lib/sendPipeline.ts. This ran
  // daily via daily-maintenance regardless of COLD_OUTREACH_PAUSED, generating
  // and quality-checking emails that then just sat unsent, burning tokens for
  // nothing.
  if (process.env.COLD_OUTREACH_PAUSED === "true") return { sent: 0, held: 0 };

  const sb = createSupabaseClient();
  let sent = 0;
  let held = 0;

  const leads = await fetchAllRows<Lead>((from, to) =>
    sb.from("leads")
      .select("*")
      .eq("status", "no_show")
      .lt("no_show_sequence_step", 3)
      .not("email", "is", null)
      .range(from, to)
  );

  for (const lead of leads) {
    // Same manual hold used everywhere else in the automated-send pipeline —
    // no automated send of any kind goes to cleaning-trade leads.
    if (lead.trade?.toLowerCase().includes("clean")) continue;

    const step = lead.no_show_sequence_step || 0;
    const sinceDate = lead.no_show_last_sent_at || lead.no_show_at;
    const days = daysSince(sinceDate);
    if (days === null || days < NO_SHOW_STEP_GAP_DAYS[step]) continue;

    try {
      const ok = await sendStep(sb, lead, step);
      if (ok) sent++; else held++;
    } catch (e) {
      await notifySlack(`⚠️ No-show follow-up (step ${step + 1}) failed for *${lead.company}*: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  return { sent, held };
}
