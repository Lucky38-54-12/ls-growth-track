import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { firstTouchpointDate } from "@/lib/followUpCadence";

export const dynamic = "force-dynamic";

const COLUMNS = ["hot", "warm", "paused", "cold_again", "onboarding"];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const column = body.column;

  if (!COLUMNS.includes(column)) {
    return NextResponse.json({ error: "invalid column" }, { status: 400 });
  }

  const { data: lead, error: fetchError } = await sb.from("leads").select("post_call_outcome, post_call_stage").eq("lead_id", params.id).single();
  if (fetchError || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  let update: Record<string, unknown> = {};

  if (column === "hot" || column === "warm") {
    const alreadyThere = lead.post_call_stage === "active" && lead.post_call_outcome === column;
    if (!alreadyThere) {
      const today = new Date().toISOString();
      update = {
        post_call_outcome: column,
        post_call_stage: "active",
        touchpoint_index: 1,
        next_touchpoint_at: firstTouchpointDate(column, today),
      };
    }
  } else if (column === "paused") {
    update = { post_call_stage: "paused", next_touchpoint_at: null };
  } else if (column === "cold_again") {
    update = { post_call_stage: "cold_again", next_touchpoint_at: null };
  } else if (column === "onboarding") {
    update = { post_call_outcome: "closed_won", post_call_stage: "onboarding", next_touchpoint_at: null };
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

  const { error } = await sb.from("leads").update(update).eq("lead_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, update });
}
