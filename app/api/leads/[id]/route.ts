import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { createSupabaseClient } from "@/lib/supabase";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const { data: sends, error } = await sb.from("email_sends").select("*").eq("lead_id", params.id).order("sent_at", { ascending: false });
  return NextResponse.json({ sends, error: error?.message || null });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const { error } = await sb.from("leads").delete().eq("lead_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
