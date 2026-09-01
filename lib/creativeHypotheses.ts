import { createSupabaseClient } from "./supabase";

export const HYPOTHESIS_STATUS = ["active", "supported", "weakened", "rejected", "inconclusive"] as const;
export type HypothesisStatus = (typeof HYPOTHESIS_STATUS)[number];

export interface CreativeHypothesisRow {
  id: string;
  client_id: string;
  question: string | null;
  claim: string;
  variable_tested: "angle" | "offer" | "persona" | "format" | "execution" | null;
  evidence_supporting: string[];
  evidence_against: string[];
  tests_run: string[];
  current_confidence: "early_signal" | "promising" | "strong_evidence" | "proven" | null;
  status: HypothesisStatus;
  next_test: string | null;
  created_at: string;
  updated_at: string;
}

export async function getActiveHypotheses(sb: ReturnType<typeof createSupabaseClient>, clientId: string, limit = 10): Promise<CreativeHypothesisRow[]> {
  const { data } = await sb
    .from("creative_hypotheses")
    .select("*")
    .eq("client_id", clientId)
    .in("status", ["active", "supported", "weakened", "inconclusive"])
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data || []) as CreativeHypothesisRow[];
}

export async function recordHypothesis(
  sb: ReturnType<typeof createSupabaseClient>,
  clientId: string,
  input: { question: string | null; claim: string; variableTested: string | null; nextTest: string | null }
): Promise<void> {
  await sb.from("creative_hypotheses").insert({
    client_id: clientId,
    question: input.question,
    claim: input.claim,
    variable_tested: input.variableTested,
    status: "active",
    next_test: input.nextTest,
  });
}

export function summarizeHypotheses(hs: CreativeHypothesisRow[]): string {
  if (!hs.length) return "No active hypotheses being tracked for this client yet.";
  return hs
    .map((h) => `- [${h.status}${h.current_confidence ? `, ${h.current_confidence}` : ""}] ${h.claim}${h.variable_tested ? ` (testing: ${h.variable_tested})` : ""}${h.next_test ? ` — next: ${h.next_test}` : ""}`)
    .join("\n");
}
