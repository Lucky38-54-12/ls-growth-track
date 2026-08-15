import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SHARED_EDITABLE_FIELDS = ["ideal_customer", "budget_targeting"] as const;
const SERVICE_FIELD_KEYS = [
  "offerPricing",
  "jobValueMargins",
  "competitorResearch",
  "leadQualificationCriteria",
  "retargetingStrategy",
] as const;

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

// Manual edits — shared fields (ideal_customer/budget_targeting) update the
// row directly and are automatically shared across every service tab since
// they're not duplicated per service; `service` + `serviceFields` merge into
// just that one key of service_details. Also handles the draft/approved
// status toggle.
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
  if (service && body.serviceFields && typeof body.serviceFields === "object") {
    const { data: existing, error: fetchError } = await sb
      .from("campaign_briefs")
      .select("service_details")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 400 });
    if (!existing) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

    const serviceDetails = { ...(existing.service_details as Record<string, Record<string, unknown>>) };
    const current = { ...(serviceDetails[service] || {}) };
    for (const key of SERVICE_FIELD_KEYS) {
      if (typeof body.serviceFields[key] === "string") current[key] = body.serviceFields[key];
    }
    serviceDetails[service] = current;
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
