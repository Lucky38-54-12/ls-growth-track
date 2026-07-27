import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { firstTouchpointDate } from "@/lib/followUpCadence";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const outcome = body.outcome;

  if (!["hot", "warm", "closed_won"].includes(outcome)) {
    return NextResponse.json({ error: "outcome must be hot, warm or closed_won" }, { status: 400 });
  }

  const doneAt = new Date().toISOString();
  const update: Record<string, unknown> = {
    post_call_outcome: outcome,
    main_objection: body.main_objection || null,
    sales_call_done_at: doneAt,
  };

  if (outcome === "closed_won") {
    update.post_call_stage = "onboarding";
    update.touchpoint_index = 0;
    update.next_touchpoint_at = null;
  } else {
    update.post_call_stage = "active";
    update.touchpoint_index = 1;
    update.next_touchpoint_at = firstTouchpointDate(outcome, doneAt);
  }

  const { error } = await sb.from("leads").update(update).eq("lead_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
