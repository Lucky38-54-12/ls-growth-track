import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// Public — hit from the client-facing /connect/[clientId] page once they say
// they've added Lucky as an admin on their Facebook Page. Self-reported, not
// verified — the real check is whether the Page shows up once Lucky runs the
// agency-side "Connect Facebook" OAuth (lib/leadQual/facebookOAuth.ts).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const sb = createSupabaseClient();
  const { error } = await sb
    .from("lq_clients")
    .update({ page_access_confirmed_at: new Date().toISOString() })
    .eq("id", clientId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
