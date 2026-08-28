import { createSupabaseClient } from "@/lib/supabase";
import { buildCallbackEmail, composeCallbackNotes, getClientForBooking } from "@/lib/leadQual/bookCallback";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Admin-only — gated by the dashboard session cookie via middleware.ts.
// Read-only: computes exactly what dropping this card into "Booked" would
// send, without booking anything or emailing anyone, so Lucky can review it
// first and only trigger the real send by confirming in the UI.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; leadId: string }> }) {
  const { id, leadId } = await params;
  const sb = createSupabaseClient();
  const { data: lead } = await sb
    .from("lq_leads")
    .select("id, scheduled_at, contact_email, notes, lq_conversations(extracted_fields)")
    .eq("id", leadId)
    .eq("client_id", id)
    .single();
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!lead.scheduled_at) return NextResponse.json({ error: "This lead has no callback time on it to book" }, { status: 400 });

  try {
    const client = await getClientForBooking(id);
    const fields = (lead.lq_conversations as any)?.extracted_fields || {};
    const leadName = String(fields.name || "Lead");
    const leadPhone = fields.phone ? String(fields.phone) : null;
    const notes = composeCallbackNotes(fields, lead.notes);

    const { subject, text } = buildCallbackEmail(client.name, leadName, leadPhone, lead.contact_email, notes, lead.scheduled_at);

    return NextResponse.json({
      leadName,
      leadPhone,
      leadEmail: lead.contact_email,
      notes,
      scheduledAt: lead.scheduled_at,
      clientName: client.name,
      clientEmail: client.email,
      emailSubject: subject,
      emailText: text,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not build preview" }, { status: 400 });
  }
}
