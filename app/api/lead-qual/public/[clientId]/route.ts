import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public, unauthenticated lookup for the client-facing /connect/[clientId]
// page — deliberately returns only what that page needs to render (name,
// trade, whether each channel is already connected), never tokens or any
// other client record fields.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const sb = createSupabaseClient();
  const { data: client, error } = await sb
    .from("lq_clients")
    .select("id, name, trade, email, ads_manager_access_confirmed_at, lq_calendar_connections(google_account_email), lq_channels(type)")
    .eq("id", clientId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    id: client.id,
    name: client.name,
    trade: client.trade,
    email: client.email,
    // lq_calendar_connections.client_id is unique, so PostgREST embeds this
    // as a single object, not an array — `?.[0]` on an object is always
    // undefined, which silently made this false for every connected client.
    calendarConnected: !!client.lq_calendar_connections,
    facebookConnected: !!client.lq_channels?.some((c: { type: string }) => c.type === "messenger"),
    adsAccessConfirmed: !!client.ads_manager_access_confirmed_at,
  });
}
