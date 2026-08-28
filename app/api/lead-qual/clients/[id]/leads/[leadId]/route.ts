import { createSupabaseClient } from "@/lib/supabase";
import { bookAndNotifyClient, composeCallbackNotes } from "@/lib/leadQual/bookCallback";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STAGES = ["new_inquiry", "followed_up", "not_ready", "booked", "not_a_fit"];

// Admin-only — gated by the dashboard session cookie via middleware.ts.
// Moving a card into "booked" (Ray's "book for viewing/quote" column) fires
// the already-agreed callback time from this lead straight onto the
// client's calendar + emails them, same as the manual book-callback form —
// dragging the card IS the booking action, no second step.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; leadId: string }> }) {
  const { id, leadId } = await params;
  const body = await request.json();
  const sb = createSupabaseClient();

  // Notes-only edit (no stage change) — the pipeline card's inline note field
  // hits this same route with just { notes }.
  if (typeof body.notes === "string" && body.pipeline_stage === undefined) {
    const { error } = await sb.from("lq_leads").update({ notes: body.notes }).eq("id", leadId).eq("client_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // Setting a callback time only (no stage change) — used when a card is
  // dragged into "Booked" but has no scheduled_at yet, so the UI can prompt
  // for a time before retrying the booking preview.
  if (typeof body.scheduled_at === "string" && body.pipeline_stage === undefined) {
    const { error } = await sb.from("lq_leads").update({ scheduled_at: body.scheduled_at }).eq("id", leadId).eq("client_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const stage = body.pipeline_stage;
  if (!STAGES.includes(stage)) return NextResponse.json({ error: "invalid stage" }, { status: 400 });

  const { data: lead } = await sb
    .from("lq_leads")
    .select("id, pipeline_stage, booking_status, scheduled_at, contact_email, notes, lq_conversations(extracted_fields)")
    .eq("id", leadId)
    .eq("client_id", id)
    .single();
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (stage === "booked" && lead.booking_status !== "booked") {
    if (!lead.scheduled_at) {
      return NextResponse.json({ error: "This lead has no callback time on it to book" }, { status: 400 });
    }
    const fields = (lead.lq_conversations as any)?.extracted_fields || {};
    try {
      const { eventId } = await bookAndNotifyClient({
        clientId: id,
        leadName: String(fields.name || "Lead"),
        leadPhone: fields.phone ? String(fields.phone) : null,
        leadEmail: lead.contact_email,
        notes: composeCallbackNotes(fields, lead.notes),
        startISO: lead.scheduled_at,
      });
      await sb.from("lq_leads").update({
        pipeline_stage: stage,
        booking_status: "booked",
        calendar_event_id: eventId,
        booked_at: new Date().toISOString(),
      }).eq("id", leadId);
    } catch (err: any) {
      return NextResponse.json({ error: err?.message || "Booking failed" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  const { error } = await sb.from("lq_leads").update({ pipeline_stage: stage }).eq("id", leadId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
