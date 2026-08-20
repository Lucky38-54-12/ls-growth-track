import { createSupabaseClient } from "@/lib/supabase";
import { AdConcept, ServiceCreativePlan } from "@/lib/campaignBrief";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SHARED_EDITABLE_FIELDS = ["ideal_customer", "budget_targeting"] as const;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("campaign_briefs")
    .select("*, lq_clients(name, trade)")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
  return NextResponse.json({ brief: data });
}

function cleanAd(a: Record<string, unknown>): AdConcept {
  const ref = a.creativeReference as Record<string, unknown> | null | undefined;
  return {
    name: typeof a.name === "string" ? a.name : "",
    format: typeof a.format === "string" ? a.format : "",
    angle: typeof a.angle === "string" ? a.angle : "",
    headline: typeof a.headline === "string" ? a.headline : "",
    primaryText: typeof a.primaryText === "string" ? a.primaryText : "",
    hook: typeof a.hook === "string" ? a.hook : "",
    first3Seconds: typeof a.first3Seconds === "string" ? a.first3Seconds : "",
    creativeConcept: typeof a.creativeConcept === "string" ? a.creativeConcept : "",
    mainMessage: typeof a.mainMessage === "string" ? a.mainMessage : "",
    offer: typeof a.offer === "string" ? a.offer : "",
    cta: typeof a.cta === "string" ? a.cta : "",
    copyFramework: typeof a.copyFramework === "string" ? a.copyFramework : "",
    hypothesis: typeof a.hypothesis === "string" ? a.hypothesis : "",
    whyTesting: typeof a.whyTesting === "string" ? a.whyTesting : "",
    creativeReference: ref
      ? {
          source: typeof ref.source === "string" ? ref.source : "",
          url: typeof ref.url === "string" ? ref.url : null,
          whatTheyreDoing: typeof ref.whatTheyreDoing === "string" ? ref.whatTheyreDoing : "",
          whatWeCanTake: typeof ref.whatWeCanTake === "string" ? ref.whatWeCanTake : "",
        }
      : null,
  };
}

// Manual edits. Shared fields (ideal_customer/budget_targeting) update the
// row directly and are automatically shared across every service tab since
// they're not duplicated per service. `service` + `plan` replace that one
// service's whole creative plan wholesale — simplest correct behavior since
// the plan's ad list is variable-length (2-4), not a fixed 3 fields to
// diff field-by-field. Also handles the draft/approved status toggle.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseClient();
  const body = await request.json();

  const update: Record<string, unknown> = {};
  for (const field of SHARED_EDITABLE_FIELDS) {
    if (typeof body[field] === "string") update[field] = body[field];
  }
  if (body.status === "draft" || body.status === "approved") update.status = body.status;

  const service = typeof body.service === "string" ? body.service.trim() : "";
  if (service && body.plan && typeof body.plan === "object") {
    const { data: existing, error: fetchError } = await sb
      .from("campaign_briefs")
      .select("service_details")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 400 });
    if (!existing) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

    const body_plan = body.plan as Record<string, unknown>;
    const mr = (body_plan.marketResearch || {}) as Record<string, unknown>;
    const plan: ServiceCreativePlan = {
      customer: typeof body_plan.customer === "string" ? body_plan.customer : "",
      customerProblem: typeof body_plan.customerProblem === "string" ? body_plan.customerProblem : "",
      desiredOutcome: typeof body_plan.desiredOutcome === "string" ? body_plan.desiredOutcome : "",
      keyObjections: typeof body_plan.keyObjections === "string" ? body_plan.keyObjections : "",
      recommendedOffer: typeof body_plan.recommendedOffer === "string" ? body_plan.recommendedOffer : "",
      marketResearch: {
        keyFindings: typeof mr.keyFindings === "string" ? mr.keyFindings : "",
        commonOffers: typeof mr.commonOffers === "string" ? mr.commonOffers : "",
        commonMessaging: typeof mr.commonMessaging === "string" ? mr.commonMessaging : "",
        creativePatterns: typeof mr.creativePatterns === "string" ? mr.creativePatterns : "",
        opportunities: typeof mr.opportunities === "string" ? mr.opportunities : "",
      },
      ads: Array.isArray(body_plan.ads) ? body_plan.ads.map((a) => cleanAd(a as Record<string, unknown>)) : [],
      flags: Array.isArray(body_plan.flags) ? body_plan.flags.filter((f): f is string => typeof f === "string") : [],
    };

    const serviceDetails = { ...(existing.service_details as Record<string, unknown>) };
    serviceDetails[service] = plan;
    update.service_details = serviceDetails;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await sb.from("campaign_briefs").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ brief: data });
}
