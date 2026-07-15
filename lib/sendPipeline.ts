import { createSupabaseClient } from "./supabase";
import { nextStepFor, STEP_NEW_STATUS } from "./leads";
import { sendPersonalizedEmail, buildFinalEmailHtml } from "./email";
import { extractLeadSlots, checkEmailQuality, checkCommonSense } from "./ai";
import {
  renderInitialEmail,
  renderFollowup1Email,
  renderFollowup2Email,
  renderFollowup3Email,
  renderFollowup4Email,
  renderCheckinEmail,
} from "./emailTemplates";
import { ALLOWED_CASE_STUDY_NAMES } from "./proofPoints";
import { notifySlack } from "./slackNotify";
import { Lead } from "./types";

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

// Every sequence email is a fixed template (lib/emailTemplates.ts) with just
// a few slots filled in — no more full AI authorship. Case studies live in
// lib/proofPoints.ts. Rebuilt 2026-07-15 after a fabricated case study
// ("Cooper Electrical") got baked into the old generation prompt and sent to
// real Wellington leads.
const CASE_STUDIES_URL = "https://lsgrowth.agency";

// Cheap, deterministic and free — runs on every send (fixed template or
// not), independent of the LLM-based checkEmailQuality gate below. Scoped to
// only the parts that actually vary per lead (the subject line — built from
// an AI-extracted job type or a past approved subject — and the recipient's
// own business name), NOT the fixed template prose itself: followup2's
// locked copy legitimately contains a hyphen ("follow-up problem", see
// lib/emailTemplates.ts) that would otherwise self-reject every single send.
function deterministicSafetyCheck(subject: string, bodyHtml: string, businessName: string): string | null {
  const dynamicText = `${subject} ${businessName}`;
  if (/[-‐‑‒–—−]/.test(dynamicText)) return `Contains a dash or hyphen in a lead-specific value (subject or business name): "${dynamicText}".`;
  if (dynamicText.includes("!")) return "Contains an exclamation mark in a lead-specific value (subject or business name).";

  for (const name of extractQuotedLikeNames(bodyHtml)) {
    if (name.toLowerCase() === businessName.trim().toLowerCase()) continue; // the recipient's own name is always allowed
    if (!ALLOWED_CASE_STUDY_NAMES.includes(name as (typeof ALLOWED_CASE_STUDY_NAMES)[number])) {
      return `Named business "${name}" is not one of the allowed case studies (${ALLOWED_CASE_STUDY_NAMES.join(", ")}) and isn't the recipient's own name.`;
    }
  }
  return null;
}

// The only named businesses that should ever appear in a sent email are the
// two allowed case studies — this looks for "Word Word Electrical" shaped
// phrases (the shape both allowed names share) so an unapproved case study
// slipped in some other way (a bad merge, a manual edit) still gets caught.
function extractQuotedLikeNames(text: string): string[] {
  const matches = text.match(/\b[A-Z][a-zA-Z]+ Electrical\b/g) || [];
  return [...new Set(matches)];
}

// Shared by /api/send (manual trigger) and /api/cron (scheduled, currently
// off) so the two never drift out of sync with each other again.
//
// Only campaign leads send here — the old static-template sequence
// (Email Outreach page) is retired, Lucky doesn't want template emails going
// out. Leads without a campaign_id just sit until they're added to one.
export async function sendNextStepFor(lead: Lead, sb: SupabaseClient): Promise<{ sent: boolean; held?: boolean; notAFit?: boolean }> {
  if (!lead.campaign_id) return { sent: false };

  // A campaign sitting in "draft" (never activated) or "paused" must not
  // send — the dashboard shows that status specifically so it reads as safe
  // to review before anything goes out, so this has to actually be true.
  const { data: campaign } = await sb.from("campaigns").select("status").eq("id", lead.campaign_id).maybeSingle();
  if (!campaign || campaign.status !== "active") return { sent: false };

  // Manual hold on cleaning-trade leads per Lucky's explicit instruction
  // (2026-07-10) after Wellington cleaning companies got emailed by mistake
  // — remove this block once he says it's OK to resume.
  if (lead.trade?.toLowerCase().includes("clean")) return { sent: false };

  const step = nextStepFor(lead);
  if (!step) return { sent: false };

  let subject: string;
  let bodyHtml: string;
  // Only the `initial` step has any AI-extracted content (job type, matched
  // job types, variant) — every later step is the lead's own company name
  // plus fixed prose, already covered by deterministicSafetyCheck above.
  // That's the only step that needs the full LLM quality gate + common-sense
  // check; running both on every followup would just be repeatedly checking
  // static text nobody wrote today.
  let needsAiQualityGate = false;

  if (step === "initial") {
    needsAiQualityGate = true;
    const extraction = await extractLeadSlots({
      company: lead.company,
      contactName: lead.contact_name,
      trade: lead.trade,
      location: lead.location,
      notes: lead.notes,
      website: lead.website,
      facebook: lead.facebook,
    });

    // The AI's only way to refuse a lead it judges is a bad ICP fit (a
    // national utility, a franchise head office, a tender-based contractor).
    // A refusal here is permanent, not a daily retry: retrying would just
    // get the same verdict again tomorrow, burning an AI call for nothing.
    if (extraction.notAFit) {
      await sb.from("leads").update({
        status: "not_interested",
        notes: `${lead.notes ? lead.notes + "\n" : ""}[${new Date().toISOString().split("T")[0]}] Auto-excluded from campaign, AI judged not a fit: ${extraction.reason}`,
      }).eq("lead_id", lead.lead_id);
      await notifySlack(
        `🚫 Auto-excluded *${lead.company}* from campaign, not a fit for LS Growth's ICP.\n` +
        `Reason: ${extraction.reason}\n` +
        `${process.env.APP_URL || "https://app.lsgrowth.agency"}/dashboard/leads/${lead.lead_id}`
      );
      return { sent: false, notAFit: true };
    }

    ({ subject, bodyHtml } = renderInitialEmail({
      variant: extraction.variant,
      jobType: extraction.jobType,
      matchedJobTypes: extraction.matchedJobTypes,
      firstName: extraction.confirmedFirstName,
    }));
  } else if (step === "followup1") {
    // "re: {initial subject}" needs the exact subject actually sent, not a
    // recomputed guess — the initial's jobType/variant aren't stored
    // anywhere else, but the subject that went out is sitting in
    // email_sends already.
    const { data: initialSend } = await sb
      .from("email_sends")
      .select("subject")
      .eq("lead_id", lead.lead_id)
      .eq("step", "initial")
      .order("sent_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    ({ subject, bodyHtml } = renderFollowup1Email(initialSend?.subject || "electrical work sitting on the table"));
  } else if (step === "followup2") {
    ({ subject, bodyHtml } = renderFollowup2Email());
  } else if (step === "followup3") {
    ({ subject, bodyHtml } = renderFollowup3Email({ businessName: lead.company, caseStudiesLink: CASE_STUDIES_URL }));
  } else if (step === "followup4") {
    ({ subject, bodyHtml } = renderFollowup4Email());
  } else {
    ({ subject, bodyHtml } = renderCheckinEmail());
  }

  const deterministicFail = deterministicSafetyCheck(subject, bodyHtml, lead.company);
  if (deterministicFail) {
    await sb.from("email_checks").insert({
      lead_id: lead.lead_id,
      step,
      subject,
      body_html: bodyHtml,
      verdict: "rejected",
      mechanical_fails: [deterministicFail],
      judgment_flags: [],
      reasoning: deterministicFail,
      sent: false,
    });
    await notifySlack(
      `🛑 Held email for *${lead.company}* (${step}) — ${deterministicFail}\n` +
      `${process.env.APP_URL || "https://app.lsgrowth.agency"}/dashboard/leads/${lead.lead_id}`
    );
    return { sent: false, held: true };
  }

  if (needsAiQualityGate) {
    const check = await checkEmailQuality({
      subject,
      bodyHtml,
      step,
      contactName: lead.contact_name,
      notes: lead.notes,
      website: lead.website,
      fixedTemplateNoCta: true,
    });
    await sb.from("email_checks").insert({
      lead_id: lead.lead_id,
      step,
      subject,
      body_html: bodyHtml,
      verdict: check.verdict,
      mechanical_fails: check.mechanicalFails,
      judgment_flags: check.judgmentFlags,
      reasoning: check.reasoning,
      sent: check.verdict === "approved",
    });
    if (check.verdict === "rejected") {
      await notifySlack(
        `🛑 Held email for *${lead.company}* (${step}) — quality check rejected it.\n` +
        `Reason: ${check.reasoning || check.mechanicalFails?.[0] || check.judgmentFlags?.[0] || "no reason given"}\n` +
        `${process.env.APP_URL || "https://app.lsgrowth.agency"}/dashboard/leads/${lead.lead_id}`
      );
      return { sent: false, held: true };
    }

    const { html: finalHtml } = buildFinalEmailHtml(lead, bodyHtml, step);
    const commonSense = await checkCommonSense({ subject, bodyHtml: finalHtml, company: lead.company });
    if (!commonSense.ok) {
      await sb.from("email_checks").insert({
        lead_id: lead.lead_id,
        step,
        subject,
        body_html: bodyHtml,
        verdict: "rejected",
        mechanical_fails: [],
        judgment_flags: [],
        reasoning: `Common-sense check: ${commonSense.reason || "flagged, no reason given"}`,
        sent: false,
      });
      await notifySlack(
        `🛑 Held email for *${lead.company}* (${step}) — failed the common-sense check.\n` +
        `Reason: ${commonSense.reason || "no reason given"}\n` +
        `${process.env.APP_URL || "https://app.lsgrowth.agency"}/dashboard/leads/${lead.lead_id}`
      );
      return { sent: false, held: true };
    }
  }

  await sendPersonalizedEmail(lead, subject, bodyHtml, step);

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
