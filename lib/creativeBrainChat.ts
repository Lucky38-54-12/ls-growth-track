import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "./supabase";
import { parseJsonResponse } from "./ai";
import { getAdCreatives } from "./metaAds";
import { getArchivedCreatives } from "./adCreativesArchive";
import { getAdLearningsForClient, insertAdLearning, AD_LEARNING_CONFIDENCE, AdLearningConfidence } from "./adLearnings";
import { searchDriveDocs, readGoogleDocText } from "./googleDocs";
import { buildBrainContext } from "./brainContext";
import { getClientBrain, summarizeClientBrain } from "./clientBrain";
import { getActiveHypotheses, summarizeHypotheses } from "./creativeHypotheses";
import { getRecentDecisions, summarizeDecisions } from "./brainDecisions";
import { getStrategicState, summarizeStrategicState } from "./strategicState";
import { notifySlack } from "./slackNotify";
import { SYSTEM_PROMPT, summarizeAds } from "./creativeBrain";

export interface CreativeBrainChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CreativeBrainChatResult {
  reply: string;
  bankedLearning: boolean;
}

// The chat-specific half of the Creative Brain persona — layered on top of
// its full strategic reasoning framework (SYSTEM_PROMPT, imported from
// creativeBrain.ts, the same one "Generate hypotheses" uses) so the two
// surfaces reason identically, just through a different output shape.
const CHAT_INSTRUCTIONS = `
==================================================
LIVE CHAT MODE
==================================================
You're now talking directly with Lucky in a live chat about this one client, not producing a full account audit. Answer conversationally and specifically, grounded in the CONTEXT block given below (client ground truth, live ad data, banked learnings, hypotheses, decisions, strategic state, and wider agency context). Don't force the full account-diagnosis structure into every reply — match the depth of your answer to what he actually asked. A quick question gets a quick, direct answer; a genuine "what should we do" question earns the full diagnosis → bottleneck → decision → recommendation reasoning.

You can bank a new creative learning directly into this client's permanent memory when the conversation surfaces one worth keeping — either because Lucky explicitly tells you to remember/bank something, or because your own analysis in this reply lands on a pattern worth remembering (Promising confidence or higher, never a bare Early Signal). This does NOT need his approval first — it only writes a learning to this client's record and mirrors into their doc, no external/real-world action, so write it immediately when it's genuinely warranted. Don't invent a learning just to have one — most turns should have none.

Respond with ONLY a JSON object, no markdown fences, no other text:
{
  "reply": "your conversational answer, always present",
  "bank_learning": null OR {
    "learning_type": "creative"|"offer"|"persona"|"angle"|"hook"|"format"|"portfolio"|"funnel"|"market",
    "service": "..." or null,
    "segment": "..." or null,
    "situation": "..." or null,
    "angle": "..." or null,
    "hook": "..." or null,
    "format": "..." or null,
    "headline": "..." or null,
    "primary_text": "..." or null,
    "cta": "..." or null,
    "offer": "..." or null,
    "visual_direction": "..." or null,
    "creative": "..." or null,
    "desire": "..." or null,
    "awareness_stage": "..." or null,
    "pain_or_desire": "pain"|"desire"|"mixed" or null,
    "observed": "the concrete thing the data/conversation showed, required",
    "inference": "your read on why, framed as inference not fact" or null,
    "what_this_proves": "..." or null,
    "what_this_does_not_prove": "..." or null,
    "next_test": "what would confirm/reject this" or null,
    "hypothesis": "..." or null,
    "confidence": "early_signal"|"promising"|"strong_evidence"|"proven",
    "priority": "high"|"medium"|"low" or null,
    "priority_reason": "..." or null
  }
}`;

async function gatherChatContext(clientId: string): Promise<{ clientName: string; contextBlock: string }> {
  const sb = createSupabaseClient();

  const { data: client, error: clientError } = await sb
    .from("lq_clients")
    .select("id, name, trade, meta_ad_account_id")
    .eq("id", clientId)
    .maybeSingle();
  if (clientError || !client) throw new Error(`Unknown client_id "${clientId}"`);

  const [ads, { data: brief }, learnings, driveMatches, fullClientContext, clientBrain, activeHypotheses, recentDecisions, priorStrategicState, archived] = await Promise.all([
    client.meta_ad_account_id ? getAdCreatives(client.meta_ad_account_id, "last_30d").catch(() => []) : Promise.resolve([]),
    sb.from("campaign_briefs").select("ideal_customer, budget_targeting, service_details").eq("client_id", clientId).maybeSingle(),
    getAdLearningsForClient(sb, clientId, 30),
    searchDriveDocs(`${client.name} strategy`, 2).catch(() => []),
    buildBrainContext(client.name).catch(() => ""),
    getClientBrain(sb, clientId).catch(() => null),
    getActiveHypotheses(sb, clientId).catch(() => []),
    getRecentDecisions(sb, clientId).catch(() => []),
    getStrategicState(sb, clientId).catch(() => null),
    getArchivedCreatives(clientId).catch(() => []),
  ]);

  const liveIds = new Set(ads.map((a) => a.id));
  const endedAdsSummary = archived
    .filter((a) => !liveIds.has(a.ad_id))
    .slice(0, 15)
    .map((a) => `- [${a.campaign_name || "—"}] "${[a.title, a.body].filter(Boolean).join(" — ") || "no copy on file"}" (ended, last seen ${a.last_seen.slice(0, 10)}): spend $${a.spend.toFixed(2)}, ${a.results ?? 0} results, cost/result ${a.cost_per_result ? `$${a.cost_per_result.toFixed(2)}` : "n/a"}, CTR ${a.ctr.toFixed(2)}%`)
    .join("\n") || "No archived (ended) ads on file yet.";

  const serviceDetails = (brief?.service_details || {}) as Record<string, { recommendedOffer?: string; ads?: { angle: string; name: string }[] }>;
  const strategySummary = Object.entries(serviceDetails)
    .map(([svc, d]) => `- ${svc}: offer "${d.recommendedOffer || "not set"}"${d.ads?.length ? `, running angles: ${d.ads.map((a) => a.angle).join(" / ")}` : ""}`)
    .join("\n") || "No confirmed strategy on file yet.";

  const learningsSummary = learnings
    .map((l) => `- [${l.status}${l.belief_status && l.belief_status !== "active" ? `, belief: ${l.belief_status}` : ""}${l.priority ? `, ${l.priority} priority` : ""}${l.confidence ? `, ${l.confidence}` : ""}] ${l.service || "general"} / segment: ${l.segment || "n/a"} / angle: ${l.angle || "n/a"} / hook: ${l.hook || "n/a"}: ${l.observed}${l.inference ? ` → ${l.inference}` : ""}${l.next_test ? ` | next test: ${l.next_test}` : ""}`)
    .join("\n") || "No banked creative memory yet.";

  let docsSummary = "No matching strategy docs found in Drive.";
  if (driveMatches.length > 0) {
    const texts = await Promise.all(
      driveMatches.map(async (m) => {
        try {
          return `--- ${m.name} ---\n${await readGoogleDocText(m.id, 2000)}`;
        } catch {
          return null;
        }
      })
    );
    const joined = texts.filter(Boolean).join("\n\n");
    if (joined) docsSummary = joined;
  }

  const contextBlock = `Client: ${client.name} (${client.trade || "trade unknown"})

CLIENT BRAIN (ground truth — authoritative unless live data below supersedes it):
${summarizeClientBrain(clientBrain)}

Ideal customer: ${brief?.ideal_customer || "not set"}
Budget + targeting: ${brief?.budget_targeting || "not set"}

Confirmed strategy per service:
${strategySummary}

Relevant strategy docs from Drive:
${docsSummary}

Full creative memory already banked for this client:
${learningsSummary}

Active hypotheses already being tracked for this client:
${summarizeHypotheses(activeHypotheses)}

Recent strategic decisions made for this client:
${summarizeDecisions(recentDecisions)}

The Brain's own last Strategic State snapshot for this client:
${summarizeStrategicState(priorStrategicState)}

Live ad-level performance, last 30 days (real creative copy + real numbers):
${ads.length ? summarizeAds(ads) : "No live ad account linked, or no spend in the last 30 days."}

Ended/archived ads from this client's full history:
${endedAdsSummary}

Wider agency context on this client (lead pipeline, calendar, sales calls, campaigns/revenue, banked agency learnings):
${fullClientContext || "Not available for this run."}`;

  return { clientName: client.name, contextBlock };
}

interface RawBankLearning {
  learning_type?: string | null; service?: string | null; segment?: string | null; situation?: string | null;
  angle?: string | null; hook?: string | null; format?: string | null; headline?: string | null; primary_text?: string | null;
  cta?: string | null; offer?: string | null; visual_direction?: string | null; creative?: string | null; desire?: string | null;
  awareness_stage?: string | null; pain_or_desire?: string | null; observed?: string; inference?: string | null;
  what_this_proves?: string | null; what_this_does_not_prove?: string | null; next_test?: string | null; hypothesis?: string | null;
  confidence?: string; priority?: string | null; priority_reason?: string | null;
}

export async function chatWithCreativeBrain(clientId: string, message: string, history: CreativeBrainChatTurn[]): Promise<CreativeBrainChatResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const { clientName, contextBlock } = await gatherChatContext(clientId);

  const anthropic = new Anthropic({ apiKey });
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: CHAT_INSTRUCTIONS },
      { type: "text", text: `CONTEXT for ${clientName}:\n\n${contextBlock}` },
    ],
    messages: [...history.map((t) => ({ role: t.role, content: t.content })), { role: "user" as const, content: message }],
  });

  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<{ reply?: string; bank_learning?: RawBankLearning | null }>(text);
  const reply = parsed.reply || text;

  const bl = parsed.bank_learning;
  if (!bl || !bl.observed?.trim()) {
    return { reply, bankedLearning: false };
  }

  const confidence = AD_LEARNING_CONFIDENCE.includes(bl.confidence as AdLearningConfidence) ? (bl.confidence as AdLearningConfidence) : "early_signal";
  try {
    await insertAdLearning(createSupabaseClient(), {
      clientId,
      service: bl.service ?? null,
      angle: bl.angle ?? null,
      creative: bl.creative ?? null,
      offer: bl.offer ?? null,
      observed: bl.observed.trim(),
      inference: bl.inference ?? null,
      nextTest: bl.next_test ?? null,
      confidence,
      segment: bl.segment ?? null,
      hook: bl.hook ?? null,
      format: bl.format ?? null,
      headline: bl.headline ?? null,
      primaryText: bl.primary_text ?? null,
      cta: bl.cta ?? null,
      visualDirection: bl.visual_direction ?? null,
      hypothesis: bl.hypothesis ?? null,
      priority: bl.priority ?? null,
      priorityReason: bl.priority_reason ?? null,
      learningType: bl.learning_type ?? null,
      situation: bl.situation ?? null,
      desire: bl.desire ?? null,
      awarenessStage: bl.awareness_stage ?? null,
      painOrDesire: bl.pain_or_desire ?? null,
      whatThisProves: bl.what_this_proves ?? null,
      whatThisDoesNotProve: bl.what_this_does_not_prove ?? null,
      relatedConcepts: [],
      testsCompleted: [],
      decisionMade: null,
      outcome: null,
    });
    await notifySlack(`Creative Brain banked a new learning for *${clientName}* from chat — /dashboard/meta-ads`);
    return { reply, bankedLearning: true };
  } catch {
    // A failed bank shouldn't fail the whole reply — Lucky still gets the
    // conversational answer even if the write itself hiccuped.
    return { reply, bankedLearning: false };
  }
}
