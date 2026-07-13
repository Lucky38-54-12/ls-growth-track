import { NextRequest, NextResponse } from "next/server";
import { generateCampaignStepEmail, checkEmailQuality, checkCommonSense } from "@/lib/ai";
import { buildFinalEmailHtml } from "@/lib/email";
import { notifySlack } from "@/lib/slackNotify";
import { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs the actual send pipeline (generate -> quality check -> common-sense
// check -> final HTML assembly) against synthetic leads that never touch the
// database or send a real email, so a regression like today's two real bugs
// (a literal "{{CTA_LINK}}" reaching the common-sense check because it ran
// on pre-substitution content, or the AI writing a "not a fit" refusal as
// the actual email) gets caught by CI within seconds of a deploy instead of
// by a human watching real sends fail. Triggered by
// .github/workflows/smoke-test.yml after any push touching the send
// pipeline; can also be hit manually to sanity-check after a related change.
function fakeLead(overrides: Partial<Lead>): Lead {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    lead_id: `smoketest-${Date.now()}`,
    company: "Smoke Test Co",
    contact_name: "there",
    email: "smoketest@example.invalid",
    trade: "Electrical",
    location: "Wellington",
    status: "not_contacted",
    date_added: new Date().toISOString().split("T")[0],
    date_contacted: null,
    last_followup: null,
    followup_count: 0,
    notes: "",
    source: "smoke_test",
    reply_category: null,
    website: null,
    facebook: null,
    personalization_hook: null,
    phone: null,
    campaign_id: null,
    follow_up_at: null,
    replied_at: null,
    replied_stale_notified: false,
    proposal_sent_at: null,
    proposal_followup_sent: false,
    unsubscribed_at: null,
    ...overrides,
  };
}

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: CheckResult[] = [];

  // Case A: a normal, well-researched small trade business. Should generate
  // real content, pass both gates, and assemble into final HTML with no
  // leftover template syntax.
  try {
    const lead = fakeLead({
      personalization_hook: "Noticed Smoke Test Co offers heat pump installs and switchboard upgrades across Wellington but isn't showing up on Facebook like some competitors.",
    });
    const generated = await generateCampaignStepEmail({
      company: lead.company, contactName: lead.contact_name, trade: lead.trade, location: lead.location,
      notes: lead.notes, website: lead.website, personalizationHook: lead.personalization_hook,
      step: "initial", priorSubjects: [],
    });

    if (generated.notAFit) {
      results.push({ name: "normal-lead: should generate a real email", pass: false, detail: `Generator incorrectly refused a normal small trade business: ${generated.reason}` });
    } else {
      const ctaBlock = `<p>Here are some case studies if you want to take a look: <a href="https://lsgrowth.agency">lsgrowth.agency</a></p><p>If you want to book a time, you can do that below: <a href="{{CTA_LINK}}">grab a time here</a>.</p>`;
      const { html: finalHtml } = buildFinalEmailHtml(lead, generated.bodyHtml + ctaBlock, "initial");

      results.push({
        name: "normal-lead: final HTML has no leftover {{CTA_LINK}}",
        pass: !finalHtml.includes("{{CTA_LINK}}"),
        detail: finalHtml.includes("{{CTA_LINK}}") ? "Found literal {{CTA_LINK}} in the assembled email — this is exactly the regression from 2026-07-13." : "clean",
      });

      const quality = await checkEmailQuality({
        subject: generated.subject, bodyHtml: generated.bodyHtml, step: "initial",
        contactName: lead.contact_name, notes: lead.notes, personalizationHook: lead.personalization_hook,
        website: lead.website, websiteSnippet: generated.websiteSnippet,
      });
      results.push({ name: "normal-lead: quality gate runs without throwing", pass: true, detail: `verdict=${quality.verdict}` });

      const commonSense = await checkCommonSense({ subject: generated.subject, bodyHtml: finalHtml, company: lead.company });
      results.push({
        name: "normal-lead: common-sense check approves real final HTML",
        pass: commonSense.ok,
        detail: commonSense.ok ? "approved" : `Flagged a normal, well-formed email: ${commonSense.reason}`,
      });
    }
  } catch (e) {
    results.push({ name: "normal-lead: pipeline runs without throwing", pass: false, detail: e instanceof Error ? e.message : String(e) });
  }

  // Case B: an obviously wrong-ICP business (a national utility). Should
  // trigger the generator's not-a-fit escape hatch, not write a refusal as
  // the actual email — this is the exact 2026-07-13 incident.
  try {
    const lead = fakeLead({
      company: "National Power Grid Utility Ltd",
      notes: "New Zealand's largest national electricity generator and retailer, publicly listed, thousands of employees, pipeline driven by regulatory and wholesale contracts.",
    });
    const generated = await generateCampaignStepEmail({
      company: lead.company, contactName: lead.contact_name, trade: lead.trade, location: lead.location,
      notes: lead.notes, website: lead.website, personalizationHook: lead.personalization_hook,
      step: "initial", priorSubjects: [],
    });
    results.push({
      name: "bad-fit-lead: generator refuses instead of emailing the refusal",
      pass: !!generated.notAFit,
      detail: generated.notAFit ? `correctly refused: ${generated.reason}` : `Generator wrote a real email to an obviously wrong-ICP business instead of refusing — subject: "${!generated.notAFit ? generated.subject : ""}"`,
    });
  } catch (e) {
    results.push({ name: "bad-fit-lead: pipeline runs without throwing", pass: false, detail: e instanceof Error ? e.message : String(e) });
  }

  const failures = results.filter((r) => !r.pass);
  const allPassed = failures.length === 0;

  if (!allPassed) {
    await notifySlack(
      `🚨 Smoke test FAILED after a deploy — send pipeline may be broken.\n` +
      failures.map((f) => `• *${f.name}*: ${f.detail}`).join("\n")
    );
  }

  return NextResponse.json({ passed: allPassed, results }, { status: allPassed ? 200 : 500 });
}
