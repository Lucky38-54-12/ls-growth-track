import { createSupabaseClient } from "./supabase";

export const AD_LEARNING_CONFIDENCE = ["early_signal", "promising", "strong_evidence", "proven"] as const;
export type AdLearningConfidence = (typeof AD_LEARNING_CONFIDENCE)[number];

export const AD_LEARNING_PRIORITY = ["high", "medium", "low"] as const;
export type AdLearningPriority = (typeof AD_LEARNING_PRIORITY)[number];

export const AD_LEARNING_STATUS = ["untested", "testing", "winner", "loser", "needs_more_data", "iteration_opportunity", "retired"] as const;
export type AdLearningStatus = (typeof AD_LEARNING_STATUS)[number];

export const AD_LEARNING_TYPE = ["creative", "offer", "persona", "angle", "hook", "format", "portfolio", "funnel", "market"] as const;
export type AdLearningType = (typeof AD_LEARNING_TYPE)[number];

export const AD_LEARNING_PAIN_OR_DESIRE = ["pain", "desire", "mixed"] as const;
export type AdLearningPainOrDesire = (typeof AD_LEARNING_PAIN_OR_DESIRE)[number];

// Belief lifecycle for the learning ITSELF — distinct from `status`, which
// tracks the underlying creative's test lifecycle. New evidence can
// strengthen, weaken, supersede, confirm or reject a belief without the
// creative's own test status changing.
export const AD_LEARNING_BELIEF_STATUS = ["active", "inconclusive", "superseded", "confirmed", "rejected"] as const;
export type AdLearningBeliefStatus = (typeof AD_LEARNING_BELIEF_STATUS)[number];

export interface AdLearning {
  id: string;
  client_id: string;
  service: string | null;
  angle: string | null;
  creative: string | null;
  offer: string | null;
  observed: string;
  inference: string | null;
  next_test: string | null;
  confidence: AdLearningConfidence;
  segment: string | null;
  hook: string | null;
  format: string | null;
  headline: string | null;
  primary_text: string | null;
  cta: string | null;
  visual_direction: string | null;
  hypothesis: string | null;
  priority: AdLearningPriority | null;
  priority_reason: string | null;
  status: AdLearningStatus;
  // Memory Object fields (Creative Brain V2)
  learning_type: AdLearningType | null;
  situation: string | null;
  desire: string | null;
  awareness_stage: string | null;
  pain_or_desire: AdLearningPainOrDesire | null;
  what_this_proves: string | null;
  what_this_does_not_prove: string | null;
  related_concepts: string[] | null;
  tests_completed: string[] | null;
  decision_made: string | null;
  outcome: string | null;
  belief_status: AdLearningBeliefStatus;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = "id, client_id, service, angle, creative, offer, observed, inference, next_test, confidence, segment, hook, format, headline, primary_text, cta, visual_direction, hypothesis, priority, priority_reason, status, learning_type, situation, desire, awareness_stage, pain_or_desire, what_this_proves, what_this_does_not_prove, related_concepts, tests_completed, decision_made, outcome, belief_status, created_at, updated_at";

export async function getAdLearningsForClient(
  sb: ReturnType<typeof createSupabaseClient>,
  clientId: string,
  limit = 15
): Promise<AdLearning[]> {
  const { data } = await sb
    .from("ad_learnings")
    .select(SELECT_COLUMNS)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data || []) as unknown as AdLearning[];
}
