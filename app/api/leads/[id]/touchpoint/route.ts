import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { advance, TouchpointResult } from "@/lib/followUpCadence";
import { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

const RESULTS = new Set(["no_answer", "spoke_booked_call", "spoke_not_ready", "closed"]);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const result: TouchpointResult = body.result;

  if (!RESULTS.has(result)) {
    return NextResponse.json({ error: "invalid result" }, { status: 400 });
  }

  const { data: lead, error: fetchError } = await sb.from("leads").select("*").eq("lead_id", params.id).single();
  if (fetchError || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const l = lead as Lead;

  if (!l.post_call_outcome || !l.sales_call_done_at) {
    return NextResponse.json({ error: "Lead has no sales-call outcome logged yet" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const advanced = advance(l.post_call_outcome, l.touchpoint_index, l.sales_call_done_at, result, now);

  const update: Record<string, unknown> = {
    last_touchpoint_at: now,
    touchpoint_index: advanced.touchpoint_index,
    next_touchpoint_at: advanced.next_touchpoint_at,
    post_call_stage: advanced.post_call_stage,
  };

  const { error } = await sb.from("leads").update(update).eq("lead_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
