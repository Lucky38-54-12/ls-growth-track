import { createSupabaseClient } from "./supabase";

export interface BrainDecisionRow {
  id: string;
  client_id: string;
  decision: string;
  reasoning: string | null;
  evidence: string[];
  hypothesis: string | null;
  confidence: "high" | "medium" | "low" | null;
  action_taken: string | null;
  outcome: string | null;
  lesson: string | null;
  created_at: string;
}

export async function getRecentDecisions(sb: ReturnType<typeof createSupabaseClient>, clientId: string, limit = 10): Promise<BrainDecisionRow[]> {
  const { data } = await sb
    .from("brain_decisions")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data || []) as BrainDecisionRow[];
}

export async function recordDecision(
  sb: ReturnType<typeof createSupabaseClient>,
  clientId: string,
  input: { decision: string; reasoning: string | null; hypothesis: string | null; confidence: "high" | "medium" | "low" | null }
): Promise<void> {
  await sb.from("brain_decisions").insert({
    client_id: clientId,
    decision: input.decision,
    reasoning: input.reasoning,
    hypothesis: input.hypothesis,
    confidence: input.confidence,
  });
}

export function summarizeDecisions(ds: BrainDecisionRow[]): string {
  if (!ds.length) return "No prior strategic decisions recorded for this client yet.";
  return ds
    .map((d) => `- [${d.created_at.slice(0, 10)}${d.confidence ? `, ${d.confidence} confidence` : ""}] ${d.decision}${d.outcome ? ` — outcome: ${d.outcome}` : " — outcome not yet recorded"}${d.lesson ? ` — lesson: ${d.lesson}` : ""}`)
    .join("\n");
}
