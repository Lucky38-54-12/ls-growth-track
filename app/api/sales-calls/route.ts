import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { SalesCall } from "@/lib/types";
import { reviewScriptAgainstCall, callToParsed } from "@/lib/salesCallsAi";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = createSupabaseClient();
  const data = await fetchAllRows<SalesCall>((from, to) =>
    sb.from("sales_calls").select("*").order("created_at", { ascending: false }).range(from, to));
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const sb = createSupabaseClient();
  const body = await req.json();

  if (!body.raw_summary || !String(body.raw_summary).trim()) {
    return NextResponse.json({ error: "Missing the raw call summary." }, { status: 400 });
  }

  const call = {
    call_date: body.call_date || new Date().toISOString().split("T")[0],
    prospect_name: body.prospect_name || "",
    business_name: body.business_name || "",
    outcome: body.outcome || "undecided",
    main_objection: body.main_objection || "",
    next_step_booked: !!body.next_step_booked,
    next_step_detail: body.next_step_detail || "",
    went_well: body.went_well || "",
    work_ons: body.work_ons || "",
    raw_summary: body.raw_summary,
  };

  const { data, error } = await sb.from("sales_calls").insert(call).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Review against the current master script right after logging — advisory
  // only, a failure here should never block the call save that already
  // succeeded above.
  let proposal = null;
  try {
    const { data: currentVersion } = await sb.from("sales_script_versions").select("*").eq("is_current", true).maybeSingle();
    if (currentVersion) {
      const review = await reviewScriptAgainstCall(currentVersion.content, callToParsed(data as SalesCall));
      const { data: inserted, error: proposalError } = await sb.from("sales_script_proposals").insert({
        call_id: data.id,
        based_on_version: currentVersion.version,
        status: "pending",
        needs_changes: review.needs_changes,
        summary: review.summary,
        diffs: review.diffs,
        new_content: review.new_content,
      }).select().single();
      if (!proposalError) proposal = inserted;
    }
  } catch {
    // Script review is advisory — a logged call must never be lost because
    // the review step failed.
  }

  return NextResponse.json({ call: data, proposal });
}
