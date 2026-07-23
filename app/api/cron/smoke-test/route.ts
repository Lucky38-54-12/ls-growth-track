import { NextRequest, NextResponse } from "next/server";
import { extractLeadSlots } from "@/lib/ai";
import { renderInitialEmail } from "@/lib/emailTemplates";
import { SSP_LINE, buildPerlLine } from "@/lib/proofPoints";
import { buildFinalEmailHtml } from "@/lib/email";
import { checkFixedTemplateGate } from "@/lib/sendPipeline";
import { notifySlack } from "@/lib/slackNotify";
import { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs the actual send pipeline (extract slots -> render fixed template ->
// fixed-template gate -> final HTML assembly) against synthetic leads that
// never touch the database or send a real email, so a regression gets
// caught by CI within seconds of a deploy instead of by a human watching
// real sends fail. Triggered by .github/workflows/smoke-test.yml after any
// push touching the send pipeline; can also be hit manually to sanity-check
// after a related change.
//
// Rewritten 2026-07-15 alongside the move to fixed templates, then again
// the same day to swap the AI-based quality/common-sense check for the
// deterministic checkFixedTemplateGate — an AI reviewer has nothing left to
// judge once the body is Lucky's own locked copy with validated slots.
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
    thinking_about_it_at: null,
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

  // Case A: a normal, well-researched small electrical business. Should
  // extract real confirmed services, render a clean fixed template, and
  // pass both gates with no leftover template syntax.
  try {
    const lead = fakeLead({
      notes: "Offers heat pump installs and switchboard upgrades across Wellington.",
    });
    const extraction = await extractLeadSlots({
      company: lead.company, contactName: lead.contact_name, trade: lead.trade, location: lead.location,
      notes: lead.notes, website: lead.website, facebook: lead.facebook,
    });

    if (extraction.notAFit) {
      results.push({ name: "normal-lead: should not flag a real small trade business as not-a-fit", pass: false, detail: `Extraction incorrectly refused a normal small trade business: ${extraction.reason}` });
    } else {
      const { subject, bodyHtml } = renderInitialEmail({
        firstName: extraction.confirmedFirstName,
        jobType: extraction.jobType,
        city: lead.location || "your area",
        matchedJobTypes: extraction.matchedJobTypes,
        isSolarDominant: extraction.isSolarDominant,
      });

      const { html: finalHtml } = buildFinalEmailHtml(lead, bodyHtml, "initial");

      results.push({
        name: "normal-lead: final HTML has no leftover template syntax",
        pass: !finalHtml.includes("{{") && !finalHtml.includes("{job type}") && !finalHtml.includes("{matched job types}"),
        detail: finalHtml.includes("{{") || finalHtml.includes("{job type}") ? "Found a literal, unfilled slot in the assembled email." : "clean",
      });

      const gate = checkFixedTemplateGate({
        subject, bodyHtml,
        slots: {
          jobType: extraction.jobType,
          matchedJobTypes: extraction.matchedJobTypes,
          confirmedFirstName: extraction.confirmedFirstName,
        },
        expectedProofLine: extraction.isSolarDominant ? SSP_LINE : buildPerlLine(extraction.matchedJobTypes),
      });
      results.push({
        name: "normal-lead: fixed-template gate approves a clean, well-researched email",
        pass: gate.verdict === "approved",
        detail: gate.verdict === "approved" ? "approved" : `rejected: ${gate.fails.join(" ")}`,
      });
    }
  } catch (e) {
    results.push({ name: "normal-lead: pipeline runs without throwing", pass: false, detail: e instanceof Error ? e.message : String(e) });
  }

  // Case B: an obviously wrong-ICP business (a national utility). Should
  // trigger the extraction's not-a-fit flag rather than fabricating slot
  // values for a business that should never be emailed at all.
  try {
    const lead = fakeLead({
      company: "National Power Grid Utility Ltd",
      notes: "New Zealand's largest national electricity generator and retailer, publicly listed, thousands of employees, pipeline driven by regulatory and wholesale contracts.",
    });
    const extraction = await extractLeadSlots({
      company: lead.company, contactName: lead.contact_name, trade: lead.trade, location: lead.location,
      notes: lead.notes, website: lead.website, facebook: lead.facebook,
    });
    results.push({
      name: "bad-fit-lead: extraction flags not_a_fit instead of fabricating slots",
      pass: extraction.notAFit === true,
      detail: extraction.notAFit ? `correctly refused: ${extraction.reason}` : "Extraction produced real slot values for an obviously wrong-ICP business instead of flagging not_a_fit.",
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
