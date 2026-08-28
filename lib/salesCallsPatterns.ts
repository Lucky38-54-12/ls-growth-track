import { SupabaseClient } from "@supabase/supabase-js";
import { StandingReviewResult, StandingReviewPatternInput } from "./salesCallsAi";
import { PatternTracker } from "./types";

// Applies a standing review's output to sales_pattern_tracker: updates
// existing patterns that recurred, inserts new ones, closes ones a later
// call proves fixed, and links the proposal (if any) to the pattern it
// addresses so approval can later mark that pattern's fix as applied.
export async function applyStandingReview(
  sb: SupabaseClient,
  result: StandingReviewResult,
  newCallId: string
): Promise<{ proposalId: string | null }> {
  let fixesPatternTrackerId: string | null = null;

  for (const p of result.rankedPatterns) {
    if (p.matchesExistingPatternId) {
      const { data: existing } = await sb.from("sales_pattern_tracker").select("*").eq("id", p.matchesExistingPatternId).maybeSingle();
      if (!existing) continue;
      const row = existing as PatternTracker;
      const callIds = Array.from(new Set([...(row.call_ids || []), newCallId, ...p.callIds]));
      const updates: Record<string, unknown> = {
        call_ids: callIds,
        occurrences: callIds.length,
        updated_at: new Date().toISOString(),
      };
      if (p.status === "closed" && row.status === "open") {
        updates.status = "closed";
        updates.closed_at = new Date().toISOString();
        updates.closed_reason = p.closedReason;
      } else if (row.fix_applied_at && p.isRepeat) {
        // Recurred after a fix was already applied — the fix isn't landing.
        updates.fix_landing_status = "not_landing";
      }
      await sb.from("sales_pattern_tracker").update(updates).eq("id", p.matchesExistingPatternId);
      if (result.fixesPatternSummary && result.fixesPatternSummary === p.summary) fixesPatternTrackerId = p.matchesExistingPatternId;
    } else {
      const { data: inserted } = await sb.from("sales_pattern_tracker").insert({
        pattern_summary: p.summary,
        status: "open",
        cost: p.cost,
        call_ids: Array.from(new Set([...p.callIds, newCallId])),
        occurrences: Math.max(1, new Set([...p.callIds, newCallId]).size),
      }).select().single();
      if (inserted && result.fixesPatternSummary && result.fixesPatternSummary === p.summary) {
        fixesPatternTrackerId = inserted.id;
      }
    }
  }

  if (!result.needs_changes) return { proposalId: null };

  const { data: currentVersion } = await sb.from("sales_script_versions").select("version").eq("is_current", true).maybeSingle();

  const { data: proposal, error } = await sb.from("sales_script_proposals").insert({
    call_id: newCallId,
    based_on_version: currentVersion?.version || 0,
    status: "pending",
    needs_changes: true,
    summary: result.summary,
    diffs: result.diffs,
    new_content: result.new_content,
  }).select().single();

  if (error || !proposal) return { proposalId: null };

  if (fixesPatternTrackerId) {
    await sb.from("sales_pattern_tracker").update({ fix_proposal_id: proposal.id }).eq("id", fixesPatternTrackerId);
  }

  return { proposalId: proposal.id };
}

// Applies an approved script proposal: cuts a new current sales_script_versions
// row from its new_content, and marks the pattern it addresses (if any) as
// fixed so the next standing review can tell whether the fix actually
// stuck. Shared by the manual approve endpoint and the auto-apply path in
// logSalesCall — a proposal is applied the same way regardless of who (or
// what) approved it.
export async function approveScriptProposal(
  sb: SupabaseClient,
  proposalId: string
): Promise<{ proposal: Record<string, unknown>; version: Record<string, unknown> } | null> {
  const { data: proposal } = await sb.from("sales_script_proposals").select("*").eq("id", proposalId).maybeSingle();
  if (!proposal || proposal.status !== "pending" || !proposal.new_content?.trim()) return null;

  const { data: latest } = await sb.from("sales_script_versions").select("version").order("version", { ascending: false }).limit(1).maybeSingle();
  const nextVersion = (latest?.version || 0) + 1;

  await sb.from("sales_script_versions").update({ is_current: false }).eq("is_current", true);

  const { data: newVersion, error: versionError } = await sb.from("sales_script_versions").insert({
    version: nextVersion,
    content: proposal.new_content,
    changelog: proposal.summary || "Approved script update.",
    is_current: true,
  }).select().single();
  if (versionError || !newVersion) return null;

  const { data: updatedProposal } = await sb.from("sales_script_proposals")
    .update({ status: "approved", decided_at: new Date().toISOString() })
    .eq("id", proposalId).select().single();

  await sb.from("sales_pattern_tracker")
    .update({ fix_applied_at: new Date().toISOString(), fix_landing_status: "untested" })
    .eq("fix_proposal_id", proposalId);

  return { proposal: updatedProposal || proposal, version: newVersion };
}

export function patternsForPrompt(patterns: PatternTracker[]): StandingReviewPatternInput[] {
  return patterns.map((p) => ({
    id: p.id,
    pattern_summary: p.pattern_summary,
    status: p.status,
    cost: p.cost,
    occurrences: p.occurrences,
    fix_applied_at: p.fix_applied_at,
    fix_landing_status: p.fix_landing_status,
  }));
}
