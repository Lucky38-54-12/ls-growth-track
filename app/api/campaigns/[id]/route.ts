import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();

  const { data: campaign, error } = await sb.from("campaigns").select("*").eq("id", params.id).maybeSingle();
  if (error || !campaign) {
    return NextResponse.json({ error: error?.message || "Campaign not found." }, { status: 404 });
  }

  const memberLinks = await fetchAllRows<{ lead_id: string }>((from, to) =>
    sb.from("campaign_leads").select("lead_id").eq("campaign_id", params.id).range(from, to)
  );
  const memberIds = memberLinks.map((m) => m.lead_id);

  const { data: leads } = memberIds.length
    ? await sb.from("leads").select("*").in("lead_id", memberIds)
    : { data: [] as Lead[] };

  return NextResponse.json({ campaign, leads: leads || [] });
}
