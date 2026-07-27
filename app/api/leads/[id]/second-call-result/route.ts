import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const result = body.result;

  if (!["closed_won", "no_close"].includes(result)) {
    return NextResponse.json({ error: "result must be closed_won or no_close" }, { status: 400 });
  }

  const { data: lead, error: fetchError } = await sb.from("leads").select("post_call_stage").eq("lead_id", params.id).single();
  if (fetchError || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (lead.post_call_stage !== "paused") {
    return NextResponse.json({ error: "Lead isn't awaiting a second-call result" }, { status: 400 });
  }

  const update = { post_call_stage: result === "closed_won" ? "onboarding" : "cold_again" };
  const { error } = await sb.from("leads").update(update).eq("lead_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
