import { createSupabaseClient } from "./supabase";

// The Brain's current one-row-per-client "what do we currently believe"
// snapshot — upserted after every analysis run so it can be read instantly
// without re-running a full analysis, and fed back in as context on the
// next run so the Brain doesn't start from zero each time.
export interface StrategicState {
  clientId: string;
  primaryBottleneck: string | null;
  secondaryBottlenecks: string[];
  strongestProvenMechanism: string | null;
  strongestCurrentConcept: string | null;
  largestPortfolioRisk: string | null;
  largestTestingGap: string | null;
  activeHypotheses: string[];
  currentStrategicPriority: string | null;
  recommendedAction: string | null;
  confidence: "high" | "medium" | "low" | null;
  whatWouldChangeTheDecision: string | null;
  updatedAt: string;
}

export async function getStrategicState(sb: ReturnType<typeof createSupabaseClient>, clientId: string): Promise<StrategicState | null> {
  const { data } = await sb.from("client_strategic_state").select("*").eq("client_id", clientId).maybeSingle();
  if (!data) return null;
  return {
    clientId: data.client_id,
    primaryBottleneck: data.primary_bottleneck,
    secondaryBottlenecks: data.secondary_bottlenecks || [],
    strongestProvenMechanism: data.strongest_proven_mechanism,
    strongestCurrentConcept: data.strongest_current_concept,
    largestPortfolioRisk: data.largest_portfolio_risk,
    largestTestingGap: data.largest_testing_gap,
    activeHypotheses: data.active_hypotheses || [],
    currentStrategicPriority: data.current_strategic_priority,
    recommendedAction: data.recommended_action,
    confidence: data.confidence,
    whatWouldChangeTheDecision: data.what_would_change_the_decision,
    updatedAt: data.updated_at,
  };
}

export async function upsertStrategicState(
  sb: ReturnType<typeof createSupabaseClient>,
  clientId: string,
  state: Omit<StrategicState, "clientId" | "updatedAt">
): Promise<void> {
  await sb.from("client_strategic_state").upsert(
    {
      client_id: clientId,
      primary_bottleneck: state.primaryBottleneck,
      secondary_bottlenecks: state.secondaryBottlenecks,
      strongest_proven_mechanism: state.strongestProvenMechanism,
      strongest_current_concept: state.strongestCurrentConcept,
      largest_portfolio_risk: state.largestPortfolioRisk,
      largest_testing_gap: state.largestTestingGap,
      active_hypotheses: state.activeHypotheses,
      current_strategic_priority: state.currentStrategicPriority,
      recommended_action: state.recommendedAction,
      confidence: state.confidence,
      what_would_change_the_decision: state.whatWouldChangeTheDecision,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id" }
  );
}

export function summarizeStrategicState(s: StrategicState | null): string {
  if (!s) return "No prior Strategic State on file — this is either the first run for this client or state hasn't been captured yet.";
  return [
    `Primary bottleneck: ${s.primaryBottleneck || "—"}`,
    `Strongest proven mechanism: ${s.strongestProvenMechanism || "—"}`,
    `Current strategic priority: ${s.currentStrategicPriority || "—"}`,
    `Recommended action (as of last run): ${s.recommendedAction || "—"}`,
    `Confidence: ${s.confidence || "—"}`,
    `Largest portfolio risk: ${s.largestPortfolioRisk || "—"}`,
    `Largest testing gap: ${s.largestTestingGap || "—"}`,
    `What would change this decision: ${s.whatWouldChangeTheDecision || "—"}`,
    `Last updated: ${s.updatedAt.slice(0, 10)}`,
  ].join("\n");
}
