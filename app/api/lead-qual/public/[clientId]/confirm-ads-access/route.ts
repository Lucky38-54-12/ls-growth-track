import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// Public — hit from the client-facing /connect/[clientId] page once they say
// they've added LS Growth as a partner on their Meta Ad Account. There's no
// OAuth flow for ad account partner access (Meta requires it be done by hand
// in Business Suite), so this is a self-reported timestamp, not a verified
// connection — Lucky still confirms it actually landed in Business Manager.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const sb = createSupabaseClient();
  const { error } = await sb
    .from("lq_clients")
    .update({ ads_manager_access_confirmed_at: new Date().toISOString() })
    .eq("id", clientId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
