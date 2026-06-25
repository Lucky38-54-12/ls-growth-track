import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { generateCampaignStepEmail } from "@/lib/ai";
import { Lead } from "@/lib/types";

const SAMPLE_LEADS = 2;
const STEPS: { step: "initial" | "followup1" | "followup2" | "followup3" | "followup4"; day: string }[] = [
  { step: "initial", day: "Day 0" },
  { step: "followup1", day: "Day 3" },
  { step: "followup2", day: "Day 7" },
  { step: "followup3", day: "Day 14" },
  { step: "followup4", day: "Day 21" },
];

// Generates the FULL 5-email sequence (not just the first one) for a couple
// of this campaign's leads — using the same AI call /api/cron makes once the
// campaign goes live — so you can see exactly what the whole follow-up arc
// looks like before activating, not just the opener.
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

  // Each lead's 5 steps must run sequentially (later steps reference earlier
  // subjects for variety), but the leads themselves are independent — running
  // them concurrently instead of one-after-another keeps total wall-clock
  // under Vercel's 60s function cap instead of stacking all leads' calls.
  const previews = await Promise.all(
    sample.map(async (lead) => {
      const steps = [];
      const priorSubjects: string[] = [];
      for (const { step, day } of STEPS) {
        try {
          const { subject, bodyHtml } = await generateCampaignStepEmail({
            company: lead.company,
            contactName: lead.contact_name,
            trade: lead.trade,
            location: lead.location,
            notes: lead.notes,
            website: lead.website,
            personalizationHook: lead.personalization_hook,
            step,
            priorSubjects,
          });
          steps.push({ step, day, subject, bodyHtml });
          priorSubjects.push(subject);
        } catch (e) {
          steps.push({ step, day, error: e instanceof Error ? e.message : "Generation failed" });
        }
      }
      return { leadId: lead.lead_id, company: lead.company, contactName: lead.contact_name, steps };
    })
  );

  return NextResponse.json({ previews, sampleSize: sample.length, totalLeads: memberIds.length });
}
