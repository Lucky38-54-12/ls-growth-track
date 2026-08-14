import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EDITABLE_FIELDS = [
  "offer_pricing",
  "main_service",
  "ideal_customer",
  "service_area",
  "job_value_margins",
  "competitor_research",
  "objective",
  "budget",
  "targeting_approach",
  "lead_qualification_criteria",
  "retargeting_strategy",
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

// Manual edits to individual fields and/or the draft/approved status —
// used by the editable form and the "Mark approved" button.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseClient();
  const body = await request.json();

  const update: Record<string, string> = {};
  for (const field of EDITABLE_FIELDS) {
    if (typeof body[field] === "string") update[field] = body[field];
  }
  if (body.status === "draft" || body.status === "approved") update.status = body.status;
  if (typeof body.doc_markdown === "string") update.doc_markdown = body.doc_markdown;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await sb.from("campaign_briefs").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ brief: data });
}
