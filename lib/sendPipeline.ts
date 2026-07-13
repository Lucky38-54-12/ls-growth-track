import { createSupabaseClient } from "./supabase";
import { nextStepFor, STEP_NEW_STATUS } from "./leads";
import { sendPersonalizedEmail } from "./email";
import { generateCampaignStepEmail, reviseCampaignStepEmail, generatePersonalizationHook, checkEmailQuality, checkCommonSense } from "./ai";
import { notifySlack } from "./slackNotify";
import { Lead } from "./types";

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

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

  // Research only ever ran at sheet-import time (lib/sheetSync.ts) — leads
  // that arrive any other way (scraper, manual entry) reach send-time with
  // no personalization_hook. Best-effort enrich here so every campaign
  // lead gets a real, researched email instead of the generic fallback.
  // No longer gated on website/facebook already being on file — leads with
  // neither used to skip enrichment entirely and go straight to the generic
  // template, which is exactly what produced the "Wellington electricians on
  // Facebook" mail-merge subjects sent to 5 different businesses today.
  // generatePersonalizationHook now web-searches for the business itself
  // when nothing is on file, so every lead gets a real research attempt.
  if (!lead.personalization_hook) {
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

  // Most recent synthesized "what's working" guidance from generateEmailLearnings
  // (lib/emailLearning.ts) — regenerated daily from real open/click/reply data,
  // so every generation call adapts as performance data comes in.
  const { data: latestLearnings } = await sb
    .from("email_learnings")
    .select("guidance")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const generatorInput = {
    company: lead.company,
    contactName: lead.contact_name,
    trade: lead.trade,
    location: lead.location,
    notes: lead.notes,
    website: lead.website,
    personalizationHook: lead.personalization_hook,
    step,
    priorSubjects: (priorSends || []).map((s) => s.subject as string),
    learnings: latestLearnings?.guidance,
  };

  // If the last attempt at this exact step was held by the quality checker,
  // feed that draft and the exact rejection reasons back in so the retry
  // fixes the actual problem instead of blindly re-rolling with no better
  // odds than the first try.
  const { data: lastCheck } = await sb
    .from("email_checks")
    .select("*")
    .eq("lead_id", lead.lead_id)
    .eq("step", step)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const generated =
    lastCheck && lastCheck.verdict === "rejected" && !lastCheck.sent
      ? await reviseCampaignStepEmail({
          ...generatorInput,
          priorSubject: lastCheck.subject,
          priorBodyHtml: lastCheck.body_html,
          rejection: {
            mechanicalFails: lastCheck.mechanical_fails || [],
            judgmentFlags: lastCheck.judgment_flags || [],
            reasoning: lastCheck.reasoning || "",
          },
        })
      : await generateCampaignStepEmail(generatorInput);

  // The AI's only way to refuse a lead it judges is a bad ICP fit (a national
  // utility, a wholesaler, a tender-based contractor) — without this, it used
  // to write that refusal AS the email itself ("not a fit", explaining why
  // sending would hurt credibility) and that content sailed through the
  // quality gate and actually sent, three times, before this existed. A
  // refusal here is permanent, not a daily retry: retrying would just get the
  // same "not a fit" verdict again tomorrow, burning an AI call for nothing.
  if (generated.notAFit) {
    await sb.from("leads").update({
      status: "not_interested",
      notes: `${lead.notes ? lead.notes + "\n" : ""}[${new Date().toISOString().split("T")[0]}] Auto-excluded from campaign, AI judged not a fit: ${generated.reason}`,
    }).eq("lead_id", lead.lead_id);
    await notifySlack(
      `🚫 Auto-excluded *${lead.company}* from campaign, not a fit for LS Growth's ICP.\n` +
      `Reason: ${generated.reason}\n` +
      `${process.env.APP_URL || "https://app.lsgrowth.agency"}/dashboard/leads/${lead.lead_id}`
    );
    return { sent: false, notAFit: true };
  }
  const { subject, bodyHtml, websiteSnippet } = generated;

  // AI-generated emails go out with nobody reading them first, so every one
  // gets checked against the rulebook before it sends. A rejected email is
  // held, not sent — the lead stays at this step and gets picked up again
  // next run instead of going out with an invented detail or a broken rule.
  // Pass the same scraped website text the generator used, so the checker
  // can actually verify specific claims instead of flagging anything
  // specific as possibly invented just because it only has a bare URL.
  const check = await checkEmailQuality({
    subject,
    bodyHtml,
    step,
    contactName: lead.contact_name,
    notes: lead.notes,
    personalizationHook: lead.personalization_hook,
    website: lead.website,
    websiteSnippet,
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

  // The CTA used to be written by the AI itself ({{CTA_LINK}} woven into a
  // sentence) — that was the source of repeated bugs (dashes, the raw
  // tracking URL leaking as visible text, wrong paragraph order). Appended
  // deterministically instead, same as the cold-call path's case-study
  // block in app/api/generate-email/route.ts, so it's byte-for-byte
  // identical and correct on every send. Checked against bodyHtml (the
  // AI-written part only) above, not this — same reasoning as the cold-call
  // route: this fixed block isn't something the quality gate needs to judge.
  const ctaBlock = `<p>Here are some case studies if you want to take a look: <a href="https://lsgrowth.agency">lsgrowth.agency</a></p><p>If you want to book a time, you can do that below: <a href="{{CTA_LINK}}">grab a time here</a>.</p>`;
  const fullBodyHtml = bodyHtml + ctaBlock;

  // Last line of defense, checking the actual assembled email (CTA block
  // included) rather than just the AI-written part — a fresh, independent
  // "would a real person actually send this" read, deliberately not another
  // pass through checkEmailQuality's checklist. This is what would have
  // caught the "not a fit" emails even if the generator/checklist fixes
  // above somehow didn't: a body explaining why a business shouldn't be
  // emailed, immediately followed by "grab a time here" to book a call, is
  // exactly the kind of self-contradiction a holistic read catches instantly.
  const commonSense = await checkCommonSense({ subject, bodyHtml: fullBodyHtml, company: lead.company });
  if (!commonSense.ok) {
    await sb.from("email_checks").insert({
      lead_id: lead.lead_id,
      step,
      subject,
      body_html: fullBodyHtml,
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

  await sendPersonalizedEmail(lead, subject, fullBodyHtml, step);

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
