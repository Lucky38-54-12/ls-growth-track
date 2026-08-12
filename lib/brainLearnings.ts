import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "./supabase";

export interface BrainLearning {
  id: string;
  insight: string;
  source_kind: string | null;
  decision: "approved" | "rejected" | null;
  created_at: string;
}

const NOTHING_TO_LEARN = "NONE";

const LEARNING_SYSTEM_PROMPT = `You distill durable, generalizable lessons from a single decision Lucky just made on something the LS Growth business brain proposed. Most individual decisions teach nothing worth remembering — a one-off typo fix, an approval with no real judgment call in it. Only respond with an insight when there's a real, reusable preference or pattern here that would change how a future proposal should be written.

Write ONLY ONE of two things:
- Exactly "${NOTHING_TO_LEARN}" if there's nothing generalizable here.
- A single plain sentence stating the durable lesson, phrased as a standing fact about how Lucky operates (e.g. "Lucky doesn't want no-show leads marked not_interested until they've missed at least two calls.") — not a description of this one event.

No other text, no explanation, no markdown.`;

// Fired once after every approve/reject decision (see
// app/api/brain/drafts/[id]/route.ts) — cheap Haiku call, wrapped so a
// failure here never blocks the real action it's attached to. The model
// itself is the noise filter (most decisions return NOTHING_TO_LEARN), not
// any growth cap on this table — pruning bad entries is a human job, done
// from the "Learned from experience" section on /dashboard/agency-brain.
export async function recordLearningFromDecision(
  sb: ReturnType<typeof createSupabaseClient>,
  params: { kind: string; content: string; decision: "approved" | "rejected"; reason?: string }
): Promise<void> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return;

    const userPrompt = `Proposal kind: ${params.kind}
What was proposed:
${params.content}

Decision: ${params.decision}
${params.reason?.trim() ? `Reason given: ${params.reason.trim()}` : "No reason given."}`;

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: LEARNING_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return;
    const insight = block.text.trim();
    if (!insight || insight === NOTHING_TO_LEARN) return;

    await sb.from("brain_learnings").insert({
      insight,
      source_kind: params.kind,
      decision: params.decision,
    });
  } catch {
    // Never let learning extraction fail the real approve/reject action.
  }
}

export async function getRecentLearnings(sb: ReturnType<typeof createSupabaseClient>, limit = 40): Promise<BrainLearning[]> {
  const { data } = await sb
    .from("brain_learnings")
    .select("id, insight, source_kind, decision, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data || []) as BrainLearning[];
}
