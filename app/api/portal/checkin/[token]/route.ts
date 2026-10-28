import { createSupabaseClient } from "@/lib/supabase";
import { verifyCheckinToken } from "@/lib/checkinPortalAuth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public by URL prefix (/api/portal is public in middleware — see its
// comment); auth here is the token itself (lib/checkinPortalAuth.ts), same
// capability-link pattern as /portal/onboarding/[token].
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clientId = await verifyCheckinToken(token);
  if (!clientId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createSupabaseClient();
  const { data: client } = await sb.from("lq_clients").select("id, name").eq("id", clientId).single();
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: leads, error } = await sb
    .from("lq_leads")
    .select("id, contact_email, created_at, lq_conversations(extracted_fields)")
    .eq("client_id", clientId)
    .eq("outcome", "qualified")
    .is("job_won_at", null)
    .is("job_lost_reason", null)
    .neq("pipeline_stage", "not_a_fit")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ client, leads });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clientId = await verifyCheckinToken(token);
  if (!clientId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { leadId, outcome, value, reason } = body as { leadId: string; outcome: "won" | "lost" | "still"; value?: number; reason?: string };
  if (!leadId || !["won", "lost", "still"].includes(outcome)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { data: lead } = await sb.from("lq_leads").select("id").eq("id", leadId).eq("client_id", clientId).single();
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (outcome === "won") {
    const { error } = await sb
      .from("lq_leads")
      .update({ job_won_at: new Date().toISOString(), job_value: typeof value === "number" ? value : null, pipeline_stage: "booked_job" })
      .eq("id", leadId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (outcome === "lost") {
    const { error } = await sb
      .from("lq_leads")
      .update({ job_lost_reason: reason?.trim() || "Didn't convert", pipeline_stage: "lost" })
      .eq("id", leadId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // "still" — no DB change, just acknowledges so the client can move to the next card

  return NextResponse.json({ ok: true });
}
