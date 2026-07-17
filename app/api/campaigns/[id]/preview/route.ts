import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { extractLeadSlots } from "@/lib/ai";
import {
  renderInitialEmail,
  renderFollowup1Email,
  renderFollowup2Email,
  renderFollowup3Email,
  renderFollowup4Email,
} from "@/lib/emailTemplates";
import { SSP_LINE, buildPerlLine } from "@/lib/proofPoints";
import { checkFixedTemplateGate } from "@/lib/sendPipeline";
import { Lead } from "@/lib/types";

const SAMPLE_LEADS = 2;
const CASE_STUDIES_URL = "https://lsgrowth.agency";
const STEPS: { step: "initial" | "followup1" | "followup2" | "followup3" | "followup4"; day: string }[] = [
  { step: "initial", day: "Day 0" },
  { step: "followup1", day: "Day 3" },
  { step: "followup2", day: "Day 7" },
  { step: "followup3", day: "Day 14" },
  { step: "followup4", day: "Day 21" },
];

// Renders the FULL 5-email sequence (not just the opener) for a couple of
// this campaign's leads, using the exact same fixed templates + slot
// extraction lib/sendPipeline.ts uses once the campaign goes live — so you
// can see exactly what the whole follow-up arc looks like before activating.
// Only the `initial` step involves an AI call (extracting confirmed
// services); every later step is the lead's own company name plus fixed
// prose, same as the real pipeline.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();

  const memberLinks = await fetchAllRows<{ lead_id: string }>((from, to) =>
    sb.from("campaign_leads").select("lead_id").eq("campaign_id", params.id).range(from, to)
  );
  const memberIds = memberLinks.map((m) => m.lead_id);
  if (!memberIds.length) {
    return NextResponse.json({ previews: [] });
  }

  const { data: leads, error } = await sb.from("leads").select("*").in("lead_id", memberIds).limit(SAMPLE_LEADS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sample = (leads || []) as Lead[];

  const previews = await Promise.all(
    sample.map(async (lead) => {
      const steps: { step: string; day: string; subject?: string; bodyHtml?: string; error?: string; notAFit?: boolean; quality?: unknown }[] = [];

      let initialSubject = "";
      try {
        const extraction = await extractLeadSlots({
          company: lead.company,
          contactName: lead.contact_name,
          trade: lead.trade,
          location: lead.location,
          notes: lead.notes,
          website: lead.website,
          facebook: lead.facebook,
        });

        if (extraction.notAFit) {
          return { leadId: lead.lead_id, company: lead.company, contactName: lead.contact_name, steps: [{ step: "initial", day: "Day 0", notAFit: true, error: extraction.reason }] };
        }

        const initial = renderInitialEmail({
          firstName: extraction.confirmedFirstName,
          jobType: extraction.jobType,
          city: (lead.location || "").replace(/\s+(NZ|AU|USA|UK)$/i, "").trim() || "your area",
          matchedJobTypes: extraction.matchedJobTypes,
          isSolarDominant: extraction.isSolarDominant,
        });
        initialSubject = initial.subject;
        const stepResult: { step: string; day: string; subject: string; bodyHtml: string; quality?: unknown } = { step: "initial", day: "Day 0", subject: initial.subject, bodyHtml: initial.bodyHtml };
        steps.push(stepResult);
        stepResult.quality = checkFixedTemplateGate({
          subject: initial.subject,
          bodyHtml: initial.bodyHtml,
          slots: {
            jobType: extraction.jobType,
            matchedJobTypes: extraction.matchedJobTypes,
            confirmedFirstName: extraction.confirmedFirstName,
          },
          expectedProofLine: extraction.isSolarDominant ? SSP_LINE : buildPerlLine(extraction.matchedJobTypes),
        });

        const followup1 = renderFollowup1Email(initialSubject);
        const followup2 = renderFollowup2Email();
        const followup3 = renderFollowup3Email({ businessName: lead.company, caseStudiesLink: CASE_STUDIES_URL, initialUsedSolar: extraction.isSolarDominant });
        const followup4 = renderFollowup4Email();
        steps.push({ step: "followup1", day: "Day 3", subject: followup1.subject, bodyHtml: followup1.bodyHtml });
        steps.push({ step: "followup2", day: "Day 7", subject: followup2.subject, bodyHtml: followup2.bodyHtml });
        steps.push({ step: "followup3", day: "Day 14", subject: followup3.subject, bodyHtml: followup3.bodyHtml });
        steps.push({ step: "followup4", day: "Day 21", subject: followup4.subject, bodyHtml: followup4.bodyHtml });
      } catch (e) {
        steps.push({ step: "initial", day: "Day 0", error: e instanceof Error ? e.message : "Extraction failed" });
        return { leadId: lead.lead_id, company: lead.company, contactName: lead.contact_name, steps };
      }

      return { leadId: lead.lead_id, company: lead.company, contactName: lead.contact_name, steps };
    })
  );

  return NextResponse.json({ previews, sampleSize: sample.length, totalLeads: memberIds.length });
}
