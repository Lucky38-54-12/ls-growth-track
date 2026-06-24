import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Flips a draft campaign live: copies its staged membership onto
// leads.campaign_id so /api/send starts treating them as campaign leads
// (AI-personalized emails, indefinite check-in cadence) on its next run.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();

  const { data: campaign } = await sb.from("campaigns").select("*").eq("id", params.id).maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (campaign.status !== "draft") {
    return NextResponse.json({ error: `Campaign is already ${campaign.status}.` }, { status: 400 });
  }

  const memberLinks = await fetchAllRows<{ lead_id: string }>((from, to) =>
    sb.from("campaign_leads").select("lead_id").eq("campaign_id", params.id).range(from, to)
  );
  const memberIds = memberLinks.map((m) => m.lead_id);

  if (memberIds.length > 0) {
    const { error: updateError } = await sb
      .from("leads")
      .update({ campaign_id: params.id })
      .in("lead_id", memberIds);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  const { error: statusError } = await sb
    .from("campaigns")
    .update({ status: "active", activated_at: new Date().toISOString() })
    .eq("id", params.id);
  if (statusError) {
    return NextResponse.json({ error: statusError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, activatedLeads: memberIds.length });
}
