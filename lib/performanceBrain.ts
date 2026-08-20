import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "./supabase";
import { parseJsonResponse } from "./ai";
import { getCampaignInsights, CampaignInsight } from "./metaAds";

export interface PerformanceRecommendation {
  title: string;
  rationale: string;
  category: "budget" | "creative" | "audience" | "location" | "qualification" | "general";
  priority: 1 | 2 | 3;
}

const SYSTEM_PROMPT = `You are the Performance Brain for Lucky at LS Growth, a lead generation agency running Meta ads for trade and home service businesses in NZ/AU. You look at one client's real campaign-level Meta Ads performance alongside their confirmed campaign strategy/ad angles and past learnings, and produce a short, prioritized list of concrete actions — not a report.

Frame every campaign as a hypothesis test: who / what problem / which angle / which creative / which offer. Cross-reference the strategy (the hypothesis) against the real Meta numbers (the result). Walk the funnel to diagnose bottlenecks: low CTR points at the hook/creative, good CTR with weak conversion points at the offer or landing experience, cheap-but-many-results with no quality signal points at wrong-audience risk. Never call something "proven" off a handful of leads or a few dollars of spend — grade your own confidence honestly in each rationale (e.g. "early signal, low spend" vs "consistent across 30 days").

Only recommend real, specific actions grounded in the actual numbers you're given — no generic "test more creatives" filler. Cap it at 5 recommendations, ranked by priority (1 = do this first). If the data is too thin to say anything real (e.g. under $20 total spend, no campaigns), return an empty recommendations array rather than inventing something.

Respond with ONLY a JSON object, no markdown fences, no other text:
{"recommendations": [{"title": "...", "rationale": "...", "category": "budget"|"creative"|"audience"|"location"|"qualification"|"general", "priority": 1|2|3}]}`;

export async function analyzeClientPerformance(clientId: string): Promise<{ clientName: string; recommendations: PerformanceRecommendation[]; inserted: number }> {
  const sb = createSupabaseClient();

  const { data: client, error: clientError } = await sb
    .from("lq_clients")
    .select("id, name, trade, meta_ad_account_id")
    .eq("id", clientId)
    .maybeSingle();
  if (clientError || !client) throw new Error(`Unknown client_id "${clientId}"`);
  if (!client.meta_ad_account_id) throw new Error(`${client.name} has no Meta ad account linked yet — set one on Campaign Setup first.`);

  const [insights, { data: brief }, { data: learnings }] = await Promise.all([
    getCampaignInsights(client.meta_ad_account_id, "last_30d"),
    sb.from("campaign_briefs").select("ideal_customer, budget_targeting, service_details").eq("client_id", clientId).maybeSingle(),
    sb.from("ad_learnings").select("service, angle, observed, inference, confidence").eq("client_id", clientId).order("created_at", { ascending: false }).limit(10),
  ]);

  if (!insights.length) {
    return { clientName: client.name, recommendations: [], inserted: 0 };
  }

  const serviceDetails = (brief?.service_details || {}) as Record<string, { recommendedOffer?: string; ads?: { angle: string; name: string }[] }>;
  const strategySummary = Object.entries(serviceDetails)
    .map(([svc, d]) => `- ${svc}: offer "${d.recommendedOffer || "not set"}"${d.ads?.length ? `, running angles: ${d.ads.map((a) => a.angle).join(" / ")}` : ""}`)
    .join("\n") || "No confirmed strategy on file yet.";

  const learningsSummary = (learnings || [])
    .map((l) => `- [${l.confidence}] ${l.service || "general"}: ${l.observed}${l.inference ? ` → ${l.inference}` : ""}`)
    .join("\n") || "No banked learnings yet.";

  const campaignSummary = (insights as CampaignInsight[])
    .map((c) => `- ${c.name} (${c.status}): spend $${c.spend.toFixed(2)}, ${c.results ?? 0} results${c.resultType ? ` (${c.resultType.replace(/_/g, " ")})` : ""}, cost/result ${c.costPerResult ? `$${c.costPerResult.toFixed(2)}` : "n/a"}, CTR ${c.ctr.toFixed(2)}%, CPC $${c.cpc.toFixed(2)}`)
    .join("\n");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");
  const anthropic = new Anthropic({ apiKey });

  const userPrompt = `Client: ${client.name} (${client.trade || "trade unknown"})

Ideal customer: ${brief?.ideal_customer || "not set"}
Budget + targeting: ${brief?.budget_targeting || "not set"}

Confirmed strategy per service:
${strategySummary}

Past banked learnings for this client:
${learningsSummary}

Last 30 days of real Meta campaign performance:
${campaignSummary}

Diagnose this client's campaigns and recommend the highest-priority actions.`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<{ recommendations?: PerformanceRecommendation[] }>(text);
  const recommendations = parsed.recommendations || [];

  // Same "don't re-propose what's already sitting in the queue" guard used
  // elsewhere in the Brain — a fresh analysis run shouldn't spam duplicate
  // recommendations if Lucky just hasn't gotten to the last batch yet.
  const { data: existingPending } = await sb
    .from("chat_drafts")
    .select("title, payload")
    .eq("kind", "recommendation")
    .eq("status", "pending");
  const existingTitles = new Set(
    (existingPending || [])
      .filter((d) => (d.payload as { clientId?: string } | null)?.clientId === clientId)
      .map((d) => d.title)
  );

  const toInsert = recommendations.filter((r) => !existingTitles.has(r.title));

  if (toInsert.length > 0) {
    await sb.from("chat_drafts").insert(
      toInsert.map((r) => ({
        kind: "recommendation",
        title: r.title,
        content: r.rationale,
        status: "pending",
        payload: { clientId, clientName: client.name, category: r.category, priority: r.priority },
      }))
    );
  }

  return { clientName: client.name, recommendations, inserted: toInsert.length };
}
