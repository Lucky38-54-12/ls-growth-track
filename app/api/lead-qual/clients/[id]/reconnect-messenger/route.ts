import { createSupabaseClient } from "@/lib/supabase";
import { reconnectMessengerChannelViaSystemUser } from "@/lib/leadQual/meta";
import { NextRequest, NextResponse } from "next/server";

// Admin-only — gated by the dashboard session cookie via middleware.ts.
// Re-mints this client's Page Access Token from the LS Growth Business
// Manager's System User instead of requiring a human to click through
// Meta's OAuth consent screen again — see refreshPageTokenViaSystemUser in
// lib/leadQual/meta.ts for why that's needed (personal-login tokens die
// silently whenever the connecting person's Facebook session is invalidated).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;

  const sb = createSupabaseClient();
  const { data: channel } = await sb
    .from("lq_channels")
    .select("external_page_id")
    .eq("client_id", clientId)
    .eq("type", "messenger")
    .maybeSingle();

  if (!channel) {
    return NextResponse.json({ error: "No Messenger channel found for this client" }, { status: 404 });
  }

  try {
    await reconnectMessengerChannelViaSystemUser(clientId, channel.external_page_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Reconnect failed" }, { status: 500 });
  }
}
