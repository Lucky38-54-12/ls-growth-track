import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { generateCampaignStepEmail } from "@/lib/ai";
import { Lead } from "@/lib/types";

const SAMPLE_SIZE = 3;

// Generates real "initial" emails for a small sample of this campaign's
// leads — using the same AI call /api/cron makes once the campaign goes
// live — so you can see exactly what people will receive before activating.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();

  const memberLinks = await fetchAllRows<{ lead_id: string }>((from, to) =>
    sb.from("campaign_leads").select("lead_id").eq("campaign_id", params.id).range(from, to)
  );
  const memberIds = memberLinks.map((m) => m.lead_id);
  if (!memberIds.length) {
    return NextResponse.json({ previews: [] });
  }

  const { data: leads, error } = await sb.from("leads").select("*").in("lead_id", memberIds).limit(SAMPLE_SIZE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sample = (leads || []) as Lead[];
  const previews = [];
  for (const lead of sample) {
    try {
      const { subject, bodyHtml } = await generateCampaignStepEmail({
        company: lead.company,
        contactName: lead.contact_name,
        trade: lead.trade,
        location: lead.location,
        notes: lead.notes,
        step: "initial",
        priorSubjects: [],
      });
      previews.push({ leadId: lead.lead_id, company: lead.company, contactName: lead.contact_name, subject, bodyHtml });
    } catch (e) {
      previews.push({ leadId: lead.lead_id, company: lead.company, contactName: lead.contact_name, error: e instanceof Error ? e.message : "Generation failed" });
    }
  }

  return NextResponse.json({ previews, sampleSize: sample.length, totalLeads: memberIds.length });
}
