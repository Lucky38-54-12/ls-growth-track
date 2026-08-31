import { createSupabaseClient } from "./supabase";

export const AD_LEARNING_CONFIDENCE = ["early_signal", "promising", "strong_evidence", "proven"] as const;
export type AdLearningConfidence = (typeof AD_LEARNING_CONFIDENCE)[number];

export const AD_LEARNING_PRIORITY = ["high", "medium", "low"] as const;
export type AdLearningPriority = (typeof AD_LEARNING_PRIORITY)[number];

export const AD_LEARNING_STATUS = ["untested", "testing", "winner", "loser", "needs_more_data", "iteration_opportunity", "retired"] as const;
export type AdLearningStatus = (typeof AD_LEARNING_STATUS)[number];

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
  created_at: string;
}

const SELECT_COLUMNS = "id, client_id, service, angle, creative, offer, observed, inference, next_test, confidence, segment, hook, format, headline, primary_text, cta, visual_direction, hypothesis, priority, priority_reason, status, created_at";

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
