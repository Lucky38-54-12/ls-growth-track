import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { SalesCall } from "@/lib/types";
import { parseCallSummary, reviewScriptAgainstCall, callToParsed } from "@/lib/salesCallsAi";
import { runSalesCallsBackup } from "@/lib/salesCallsBackupSync";

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
  const rawSummary = body.raw_summary;
  const yourTake = body.your_take || "";

  if (!rawSummary || !String(rawSummary).trim()) {
    return NextResponse.json({ error: "Paste the call summary first." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
  }

  let parsed;
  try {
    parsed = await parseCallSummary(rawSummary);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Couldn't read that call: ${message}` }, { status: 502 });
  }

  // Everything else comes off the transcript automatically. work_ons is the
  // one thing Lucky types himself, his own honest read of where he mucked
  // up, verbatim, in his own words rather than an AI guess.
  const call = {
    call_date: parsed.call_date,
    prospect_name: parsed.prospect_name,
    business_name: parsed.business_name,
    outcome: parsed.outcome,
    main_objection: parsed.main_objection,
    next_step_booked: parsed.next_step_booked,
    next_step_detail: parsed.next_step_detail,
    went_well: parsed.went_well,
    work_ons: yourTake,
    raw_summary: rawSummary,
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

  let backupUrl: string | null = null;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      const result = await runSalesCallsBackup();
      backupUrl = result.url;
    } catch {
      // Backup is best-effort — a logged call must never be lost because the
      // Drive push failed. The manual "Backup to Drive" button covers retry.
    }
  }

  return NextResponse.json({ call: data, proposal, backupUrl });
}
