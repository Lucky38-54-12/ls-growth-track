import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ALLOWED = ["agreement_sent", "ads_manager_access", "agreement_signed", "campaign_live"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const update: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) update[key] = !!body[key];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }
  const { error } = await sb.from("leads").update(update).eq("lead_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
