import { createSupabaseClient, fetchAllRows } from "./supabase";
import { sendGmailFollowup } from "./email";
import { generateCallFollowupEmail } from "./generateCallEmail";
import { checkEmailQuality } from "./ai";
import { notifySlack } from "./slackNotify";
import { Lead } from "./types";

// Cold-call leads never get the generic templated sequence (see
// nextStepFor in lib/leads.ts — cold_call source returns null there on
// purpose, since the initial email is a one-off personalized send from the
// Cold Call page). But a lead that said "thinking about it" and then went
// quiet still needs chasing, same as a stale proposal does (see
// proposalFollowup.ts, same pattern) — this covers exactly that: two
// automatic, low-pressure nudges before it's left alone for Lucky to
// follow up manually.
const DAYS_BEFORE_NUDGE_1 = 3; // days sitting in "thinking_about_it" with no reply
const DAYS_BEFORE_NUDGE_2 = 4; // days after nudge 1 with still no reply

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  // thinking_about_it_at is a full ISO timestamp; last_followup/date_contacted
  // are date-only strings — new Date() parses both fine without the
  // T00:00:00Z suffix the date-only lib/leads.ts helper needs.
  const then = new Date(dateStr);
  return Math.floor((Date.now() - then.getTime()) / (1000 * 60 * 60 * 24));
}

async function sendNudge(
  sb: ReturnType<typeof createSupabaseClient>,
  lead: Lead,
  instruction: string,
  nextStatus: "followup_1_sent" | "followup_2_sent"
): Promise<boolean> {
  const generated = await generateCallFollowupEmail(lead, instruction);
  if (!generated) return false;

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
    await notifySlack(
      `🛑 Held cold-call nudge for *${lead.company}* — quality check rejected it.\n` +
      `Reason: ${quality.reasoning || quality.mechanicalFails?.[0] || quality.judgmentFlags?.[0] || "no reason given"}\n` +
      `${process.env.APP_URL || "https://app.lsgrowth.agency"}/dashboard/leads/${lead.lead_id}`
    );
    // Leave status as-is so it retries next run once the issue is fixed.
    return false;
  }

  await sendGmailFollowup(lead, generated.subject, generated.bodyHtml);

  const today = new Date().toISOString().split("T")[0];
  await sb.from("leads").update({
    status: nextStatus,
    last_followup: today,
    followup_count: (lead.followup_count || 0) + 1,
  }).eq("lead_id", lead.lead_id);

  return true;
}

export async function sendColdCallNudges(): Promise<{ followup1Sent: number; followup2Sent: number; held: number }> {
  const sb = createSupabaseClient();
  let followup1Sent = 0;
  let followup2Sent = 0;
  let held = 0;

  const stage1Leads = await fetchAllRows<Lead>((from, to) =>
    sb.from("leads")
      .select("*")
      .eq("source", "cold_call")
      .eq("status", "thinking_about_it")
      .not("email", "is", null)
      .range(from, to)
  );

  for (const lead of stage1Leads) {
    // Same manual hold as proposalFollowup.ts — no automated send of any
    // kind goes to cleaning-trade leads until Lucky says otherwise.
    if (lead.trade?.toLowerCase().includes("clean")) continue;
    // thinking_about_it_at is set the moment the status flips (see
    // statusTimestampUpdates in lib/leads.ts) — that's the real "went quiet"
    // moment. Older leads that entered this status before that column
    // existed won't have it, so fall back to the last real touchpoint.
    const days = daysSince(lead.thinking_about_it_at || lead.last_followup || lead.date_contacted);
    if (days === null || days < DAYS_BEFORE_NUDGE_1) continue;

    try {
      const sent = await sendNudge(
        sb,
        lead,
        "They said on the call they were thinking it over and it's been a few days with no reply. Write a short, low-pressure check-in — ask if they've had a chance to think it over or if anything's come up, don't re-pitch or repeat what was already said on the call.",
        "followup_1_sent"
      );
      if (sent) followup1Sent++; else held++;
    } catch (e) {
      await notifySlack(`⚠️ Cold-call nudge 1 failed for *${lead.company}*: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  const stage2Leads = await fetchAllRows<Lead>((from, to) =>
    sb.from("leads")
      .select("*")
      .eq("source", "cold_call")
      .eq("status", "followup_1_sent")
      .not("email", "is", null)
      .range(from, to)
  );

  for (const lead of stage2Leads) {
    if (lead.trade?.toLowerCase().includes("clean")) continue;
    const days = daysSince(lead.last_followup || lead.date_contacted);
    if (days === null || days < DAYS_BEFORE_NUDGE_2) continue;

    try {
      const sent = await sendNudge(
        sb,
        lead,
        "It's been over a week now since the call with no reply, including one previous check-in that also went unanswered. Write a short, genuinely low-pressure final nudge — acknowledge it might not be the right time, leave the door open, don't push or re-explain the offer.",
        "followup_2_sent"
      );
      if (sent) followup2Sent++; else held++;
    } catch (e) {
      await notifySlack(`⚠️ Cold-call nudge 2 failed for *${lead.company}*: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  return { followup1Sent, followup2Sent, held };
}
