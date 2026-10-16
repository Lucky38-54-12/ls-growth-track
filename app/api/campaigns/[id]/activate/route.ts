import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { runSendBatch } from "@/lib/sendPipeline";
import { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  let activatedLeads: Lead[] = [];
  if (memberIds.length > 0) {
    const { data } = await sb.from("leads").select("*").in("lead_id", memberIds);
    activatedLeads = data || [];
  }

  // Leads can come into a campaign already carrying history from an older,
  // separate outreach run (the old non-campaign follow-up system, or a prior
  // campaign) — e.g. "already went through the full sequence months ago with
  // no reply". Resuming them mid-sequence under a new campaign is wrong on
  // two counts: it sends whatever step they happen to be stuck on instead of
  // a proper fresh intro, and because every step's due-date is anchored to
  // the ORIGINAL date_contacted (see nextStepFor in lib/leads.ts), a lead
  // that's months overdue has every remaining step due at once — confirmed in
  // production 2026-10-16, when 49 dormant Wellington leads each got 3-4
  // follow-ups inside 90 seconds after being folded into a new campaign this
  // way. Leads genuinely done with this business (not_interested, bounced,
  // closed, no_close, replied, booked, discovery_done) are deliberately left
  // alone here, not reset — only the "still technically mid-sequence, just
  // dormant" statuses get a clean restart.
  const RESUMABLE_STATUSES = new Set(["contacted", "followup_1_sent", "followup_2_sent", "followup_3_sent", "sequence_complete"]);
  const staleLeadIds = activatedLeads.filter((l) => RESUMABLE_STATUSES.has(l.status)).map((l) => l.lead_id);
  if (staleLeadIds.length > 0) {
    await sb.from("leads").update({
      status: "not_contacted",
      date_contacted: null,
      last_followup: null,
      followup_count: 0,
    }).in("lead_id", staleLeadIds);
    activatedLeads = activatedLeads.map((l) =>
      staleLeadIds.includes(l.lead_id)
        ? { ...l, status: "not_contacted" as const, date_contacted: null, last_followup: null, followup_count: 0 }
        : l
    );
  }

  // Onboarding clients aren't linked to leads by ID (see the onboarding recap
  // sync in app/api/onboarding/route.ts, which matches the same way) — email
  // is the only bridge between the two systems, so auto-tick campaign_launched
  // for any onboarding client whose email matches a lead this campaign just activated.
  const activatedEmails = new Set(activatedLeads.map((l) => l.email?.toLowerCase()).filter(Boolean));
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

  // Fire the first batch immediately instead of making it wait for the next
  // cron window (up to 24h away) — this is what used to force a manual
  // GitHub Actions trigger every time a campaign was activated. Time-boxed
  // tighter than /api/cron's own budget since this request already spent
  // time on the campaign/onboarding bookkeeping above; anything that doesn't
  // fit gets picked up by tomorrow's scheduled run same as always, since
  // these leads now carry campaign_id regardless of how many got sent here.
  const batch = activatedLeads.length
    ? await runSendBatch(activatedLeads, sb, { targetSent: activatedLeads.length, timeBudgetMs: 20_000, concurrency: 6 })
    : { sent: 0, held: 0, notAFit: 0, processed: 0, errors: [], ranOutOfTime: false };

  return NextResponse.json({ ok: true, activatedLeads: memberIds.length, firstBatch: batch });
}
