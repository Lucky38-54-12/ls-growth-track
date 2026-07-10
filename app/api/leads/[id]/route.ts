import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { createSupabaseClient } from "@/lib/supabase";
import { statusTimestampUpdates } from "@/lib/leads";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const { error } = await sb.from("leads").delete().eq("lead_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const ALLOWED = ["reply_category", "notes", "status"];
  const update: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) update[key] = body[key];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }
  if (typeof update.status === "string") Object.assign(update, statusTimestampUpdates(update.status));
  const { error } = await sb.from("leads").update(update).eq("lead_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: true });
}
