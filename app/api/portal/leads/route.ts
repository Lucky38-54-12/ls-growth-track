import { createSupabaseClient } from "@/lib/supabase";
import { CLIENT_COOKIE_NAME, verifyClientSessionToken } from "@/lib/leadQual/clientAuth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Middleware already gates /api/portal/* on this same cookie, but the route
// still verifies it directly — middleware only decides whether the request
// proceeds, it has no way to hand the resolved clientId to the route handler.
export async function GET(request: NextRequest) {
  const token = request.cookies.get(CLIENT_COOKIE_NAME)?.value;
  const clientId = token ? await verifyClientSessionToken(token) : null;
  if (!clientId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createSupabaseClient();
  const { data: client } = await sb.from("lq_clients").select("id, name").eq("id", clientId).single();
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: leads, error } = await sb
    .from("lq_leads")
    .select("id, outcome, booking_status, calendar_event_id, booked_at, scheduled_at, created_at, contact_email, pipeline_stage, notes, lq_conversations(extracted_fields)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ client, leads });
}
