import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseClient();
  const { error } = await sb.from("leads").update({ follow_up_at: null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
