import { createSupabaseClient, fetchAllRows } from "./supabase";
import { SalesCall, PatternTracker, ScriptProposal } from "./types";
import { parseCallSummary, runStandingScriptReview, StandingReviewCallRef } from "./salesCallsAi";
import { applyStandingReview, patternsForPrompt } from "./salesCallsPatterns";
import { runSalesCallsBackup } from "./salesCallsBackupSync";

export interface LogSalesCallResult {
  call: SalesCall;
  proposal: ScriptProposal | null;
  backupUrl: string | null;
}

// The actual logic behind the /dashboard/sales-calls "Log a Call" form
// (see app/api/sales-calls/route.ts, which now just wraps this) — pulled
// out so the Brain chat can do exactly the same thing when Lucky pastes a
// call straight into it: parse it, save the real row, and run the same
// standing script review, instead of duplicating this in two places.
export async function logSalesCall(
  sb: ReturnType<typeof createSupabaseClient>,
  rawSummary: string,
  yourTake: string
): Promise<LogSalesCallResult> {
  const parsed = await parseCallSummary(rawSummary);

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
  if (error) throw new Error(error.message);

  // Standing review, runs after every call, permanently: reads every logged
  // call (not just this one) plus the open/closed pattern list, ranks
  // recurring misses by frequency and cost, and only proposes a change for
  // the highest priority one that isn't a one-off. Advisory only, a failure
  // here should never block the call save that already succeeded above.
  let proposal: ScriptProposal | null = null;
  try {
    const { data: currentVersion } = await sb.from("sales_script_versions").select("*").eq("is_current", true).maybeSingle();
    if (currentVersion) {
      const [allCalls, { data: existingPatterns }] = await Promise.all([
        fetchAllRows<SalesCall>((from, to) => sb.from("sales_calls").select("*").order("call_date", { ascending: true }).range(from, to)),
        sb.from("sales_pattern_tracker").select("*"),
      ]);
      const callRefs: StandingReviewCallRef[] = allCalls.map((c) => ({
        id: c.id,
        call_date: c.call_date,
        outcome: c.outcome,
        main_objection: c.main_objection,
        next_step_booked: c.next_step_booked,
        next_step_detail: c.next_step_detail,
        went_well: c.went_well,
        work_ons: c.work_ons,
      }));
      const review = await runStandingScriptReview(currentVersion.content, callRefs, patternsForPrompt((existingPatterns || []) as PatternTracker[]));
      const { proposalId } = await applyStandingReview(sb, review, data.id);
      if (proposalId) {
        const { data: inserted } = await sb.from("sales_script_proposals").select("*").eq("id", proposalId).maybeSingle();
        proposal = inserted;
      }
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

  return { call: data as SalesCall, proposal, backupUrl };
}
