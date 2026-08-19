import { createSupabaseClient } from "./supabase";

export const AD_LEARNING_CONFIDENCE = ["early_signal", "promising", "strong_evidence", "proven"] as const;
export type AdLearningConfidence = (typeof AD_LEARNING_CONFIDENCE)[number];

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
  created_at: string;
}

export async function getAdLearningsForClient(
  sb: ReturnType<typeof createSupabaseClient>,
  clientId: string,
  limit = 15
): Promise<AdLearning[]> {
  const { data } = await sb
    .from("ad_learnings")
    .select("id, client_id, service, angle, creative, offer, observed, inference, next_test, confidence, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data || []) as AdLearning[];
}
