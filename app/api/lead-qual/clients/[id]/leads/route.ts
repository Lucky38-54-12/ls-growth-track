import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("lq_leads")
    .select("id, outcome, score, booking_status, contact_email, scheduled_at, pipeline_stage, created_at, conversation_id, lq_conversations(extracted_fields)")
    .eq("client_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ leads: data });
}

// Admin-only — gated by the dashboard session cookie via middleware.ts.
// Manually drops a phoned-in lead onto this client's pipeline board so it
// can be dragged through stages same as a Messenger-qualified one. The
// callback time is captured here (Lucky already agreed it with the lead on
// the call) rather than decided later — dragging the card into "Booked
// Jobs" just fires that already-agreed time onto the client's calendar.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { leadName, leadPhone, leadEmail, notes, scheduledAt } = body;

  if (!leadName || !scheduledAt) {
    return NextResponse.json({ error: "leadName and scheduledAt are required" }, { status: 400 });
  }

  const sb = createSupabaseClient();

  // lq_leads.conversation_id is a required FK — a manually phoned-in lead
  // has no Messenger conversation, so we create a lightweight standalone one
  // to hang the lead off, storing the same shape of extracted_fields the AI
  // qualifier would so the pipeline card renders identically either way.
  const { data: conversation, error: convError } = await sb
    .from("lq_conversations")
    .insert({
      client_id: id,
      status: "qualified",
      contact: { name: leadName, phone: leadPhone || null, email: leadEmail || null },
      extracted_fields: { name: leadName, phone: leadPhone || null, job_type: notes || null },
    })
    .select("id")
    .single();
  if (convError || !conversation) {
    return NextResponse.json({ error: convError?.message || "Could not create lead" }, { status: 400 });
  }

  const { data: lead, error: leadError } = await sb
    .from("lq_leads")
    .insert({
      conversation_id: conversation.id,
      client_id: id,
      outcome: "qualified",
      booking_status: "pending",
      contact_email: leadEmail || null,
      scheduled_at: scheduledAt,
      pipeline_stage: "new_inquiry",
    })
    .select("id, outcome, score, booking_status, contact_email, scheduled_at, pipeline_stage, created_at, conversation_id, lq_conversations(extracted_fields)")
    .single();
  if (leadError || !lead) {
    return NextResponse.json({ error: leadError?.message || "Could not create lead" }, { status: 400 });
  }

  return NextResponse.json({ lead });
}
