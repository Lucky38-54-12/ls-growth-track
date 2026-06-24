import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

// Creates a draft campaign and stages the selected leads in campaign_leads.
// Staging does NOT touch leads.campaign_id, so nothing starts sending until
// the campaign is explicitly activated via /api/campaigns/[id]/activate.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, leadIds } = body as { name?: string; leadIds?: string[] };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Campaign name is required." }, { status: 400 });
  }
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: "Select at least one lead." }, { status: 400 });
  }

  const sb = createSupabaseClient();

  const { data: campaign, error } = await sb
    .from("campaigns")
    .insert({ name: name.trim(), status: "draft" })
    .select()
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: error?.message || "Failed to create campaign." }, { status: 500 });
  }

  const { error: linkError } = await sb
    .from("campaign_leads")
    .insert(leadIds.map((lead_id) => ({ campaign_id: campaign.id, lead_id })));

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  return NextResponse.json({ campaign });
}

export async function GET() {
  const sb = createSupabaseClient();

  const { data: campaigns, error } = await sb
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const [campaignLeads, leads] = await Promise.all([
    fetchAllRows<{ campaign_id: string; lead_id: string }>((from, to) =>
      sb.from("campaign_leads").select("campaign_id, lead_id").range(from, to)
    ),
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").range(from, to)),
  ]);

  const leadsById = new Map(leads.map((l) => [l.lead_id, l]));

  const stats = (campaigns || []).map((c) => {
    const memberIds = campaignLeads.filter((cl) => cl.campaign_id === c.id).map((cl) => cl.lead_id);
    const members = memberIds.map((id) => leadsById.get(id)).filter((l): l is Lead => !!l);
    const sent = members.filter((l) => l.status !== "not_contacted").length;
    const replied = members.filter((l) => l.status === "replied" || l.status === "booked").length;
    const booked = members.filter((l) => l.status === "booked").length;
    return { ...c, leadCount: memberIds.length, sent, replied, booked };
  });

  return NextResponse.json({ campaigns: stats });
}
