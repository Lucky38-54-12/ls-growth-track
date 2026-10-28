import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { buildOnboardingCallRecapEmail } from "@/lib/onboardingCallRecapEmail";
import { creativeAsksFor } from "@/lib/creativeAskExamples";
import { OnboardingClient } from "@/lib/types";

export const dynamic = "force-dynamic";

// Marks the onboarding call (the second call, after contract sign-off) as
// done, saves what was actually agreed for this client, and drafts the
// written recap — held as "pending" like the kickoff email so Lucky can
// check it over before it goes out.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const trade: string | null = typeof body.trade === "string" && body.trade.trim() ? body.trade.trim() : null;
  const firstReviewDate: string | null = typeof body.firstReviewDate === "string" && body.firstReviewDate.trim() ? body.firstReviewDate.trim() : null;
  const campaignStartDate: string | null = typeof body.campaignStartDate === "string" && body.campaignStartDate.trim() ? body.campaignStartDate.trim() : null;
  const checkinScheduleNote: string | null = typeof body.checkinScheduleNote === "string" && body.checkinScheduleNote.trim() ? body.checkinScheduleNote.trim() : null;
  const creativesReceived: boolean = Boolean(body.creativesReceived);
  const notes: string | null = typeof body.notes === "string" ? body.notes : null;

  // The whole point of this gate: a start date never gets locked in on top
  // of a promise to "send it soon" — ads built on borrowed/generic creative
  // are what's driving clients to say the ads don't look like their business.
  // Enforced here too, not just greyed out in the UI, since this is the one
  // rule that actually has to hold.
  if (campaignStartDate && !creativesReceived) {
    return NextResponse.json({ error: "Can't set a campaign start date until creatives are marked received." }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { data: client, error } = await sb.from("onboarding_clients").select("*").eq("id", params.id).single();
  if (error || !client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const row = client as OnboardingClient;
  if (!row.email) return NextResponse.json({ error: "Client has no email on file to send the recap to." }, { status: 400 });

  const { subject, html } = buildOnboardingCallRecapEmail({
    clientName: row.name,
    company: row.company,
    firstReviewDate,
    campaignStartDate,
    checkinScheduleNote,
    creativesReceived,
    outstandingCreativeAsks: creativeAsksFor(trade || row.trade),
  });

  const stepsToAdd = ["kickoff_booked", "kickoff_done", "expectations_set"];
  if (creativesReceived) stepsToAdd.push("creatives_received");
  const nextSteps = Array.from(new Set([...(row.completed_steps || []), ...stepsToAdd]));

  const { data: updated, error: updateError } = await sb
    .from("onboarding_clients")
    .update({
      trade: trade || row.trade,
      first_review_date: firstReviewDate,
      campaign_start_date: campaignStartDate,
      checkin_schedule_note: checkinScheduleNote,
      creatives_received_at: creativesReceived ? (row.creatives_received_at || new Date().toISOString()) : row.creatives_received_at,
      onboarding_call_notes: notes,
      onboarding_call_completed_at: new Date().toISOString(),
      onboarding_recap_status: "pending",
      onboarding_recap_subject: subject,
      onboarding_recap_html: html,
      completed_steps: nextSteps,
    })
    .eq("id", params.id)
    .select()
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ client: updated });
}
