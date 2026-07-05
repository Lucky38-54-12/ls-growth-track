import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ pendingId: string }> }) {
  const { pendingId } = await params;
  const sb = createSupabaseClient();
  const { data, error } = await sb.from("lq_pending_facebook_connections").select("pages").eq("id", pendingId).maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "not found or already used" }, { status: 404 });

  // Page access tokens themselves never need to reach the browser — the
  // picker only needs id/name to render the choice.
  const pages = (data.pages as { id: string; name: string }[]).map((p) => ({ id: p.id, name: p.name }));
  return NextResponse.json({ pages });
}
