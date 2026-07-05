import { createSupabaseClient } from "@/lib/supabase";
import { connectMessengerPage } from "@/lib/leadQual/meta";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { pendingId, clientId, pageId } = await request.json();
  if (!pendingId || !clientId || !pageId) {
    return NextResponse.json({ error: "pendingId, clientId, and pageId are required" }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { data: pending, error } = await sb.from("lq_pending_facebook_connections").select("pages").eq("id", pendingId).single();
  if (error || !pending) return NextResponse.json({ error: "pending connection not found or expired" }, { status: 404 });

  const page = (pending.pages as { id: string; access_token: string }[]).find((p) => p.id === pageId);
  if (!page) return NextResponse.json({ error: "page not found in pending list" }, { status: 400 });

  try {
    await connectMessengerPage(clientId, page.id, page.access_token);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  await sb.from("lq_pending_facebook_connections").delete().eq("id", pendingId);
  return NextResponse.json({ ok: true });
}
