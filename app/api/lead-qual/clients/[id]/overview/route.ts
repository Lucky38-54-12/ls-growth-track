import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Admin-only, everything-in-one-call view for a single client — backs the
// dropdown-driven overview on /dashboard/clients so Lucky can see a client's
// calendar, email sequence and pipeline without hopping into their portal.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseClient();

  const [{ data: client, error: clientError }, { data: leads, error: leadsError }, { data: enrollments, error: enrollmentsError }] = await Promise.all([
    sb
      .from("lq_clients")
      .select("*, lq_calendar_connections(google_account_email, connected_at), lq_channels(type, external_page_id)")
      .eq("id", id)
      .single(),
    sb
      .from("lq_leads")
      .select("id, outcome, score, booking_status, contact_email, scheduled_at, pipeline_stage, created_at, conversation_id, lq_conversations(extracted_fields, contact)")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    sb
      .from("lq_nurture_enrollments")
      .select("id, current_step, status, next_send_at, enrolled_at, contact_email, lq_leads(id, contact_email, created_at, lq_conversations(extracted_fields)), lq_nurture_sequences(steps)")
      .eq("client_id", id)
      .order("enrolled_at", { ascending: false })
      .limit(100),
  ]);

  if (clientError) return NextResponse.json({ error: clientError.message }, { status: 400 });
  if (leadsError) return NextResponse.json({ error: leadsError.message }, { status: 400 });
  if (enrollmentsError) return NextResponse.json({ error: enrollmentsError.message }, { status: 400 });

  return NextResponse.json({ client, leads: leads || [], enrollments: enrollments || [] });
}
