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

  // Onboarding clients aren't linked to leads by ID (see the onboarding recap
  // sync in app/api/onboarding/route.ts, which matches the same way) — email
  // is the only bridge between the two systems, so auto-tick campaign_launched
  // for any onboarding client whose email matches a lead this campaign just activated.
  if (memberIds.length > 0) {
    const { data: activatedLeads } = await sb.from("leads").select("email").in("lead_id", memberIds);
    const activatedEmails = new Set((activatedLeads || []).map((l) => l.email?.toLowerCase()).filter(Boolean));
    if (activatedEmails.size > 0) {
      const { data: clients } = await sb.from("onboarding_clients").select("id, email, completed_steps");
      for (const client of clients || []) {
        if (!client.email || !activatedEmails.has(client.email.toLowerCase())) continue;
        if ((client.completed_steps || []).includes("campaign_launched")) continue;
        await sb.from("onboarding_clients")
          .update({ completed_steps: [...(client.completed_steps || []), "campaign_launched"] })
          .eq("id", client.id);
      }
    }
  }

  return NextResponse.json({ ok: true, activatedLeads: memberIds.length });
}
