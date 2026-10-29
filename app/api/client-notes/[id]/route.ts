import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Toggle resolved — the UI calls this when Lucky ticks a note off after
// actually bringing it up with the client.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const resolved = body?.resolved as boolean | undefined;
  if (typeof resolved !== "boolean") return NextResponse.json({ error: "resolved (boolean) is required" }, { status: 400 });

  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("client_catchup_notes")
    .update({ resolved })
    .eq("id", id)
    .select("id, lead_sheet_sync_id, note, resolved, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ note: data });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseClient();
  const { error } = await sb.from("client_catchup_notes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
