import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { key, content } = body;
  if (typeof key !== "string" || !key.trim() || typeof content !== "string") {
    return NextResponse.json({ error: "key and content are required" }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { error } = await sb.from("agency_brain").update({ content, updated_at: new Date().toISOString() }).eq("key", key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: true });
}
