import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "./supabase";
import { parseJsonResponse } from "./ai";
import { getAdCreatives, AdCreativeInsight } from "./metaAds";
import { getAdLearningsForClient, AD_LEARNING_PRIORITY, AdLearningPriority } from "./adLearnings";
import { syncAdCreativesArchive, getArchivedCreatives } from "./adCreativesArchive";
import { searchDriveDocs, readGoogleDocText } from "./googleDocs";
import { notifySlack } from "./slackNotify";

export interface CreativeRecommendation {
  creativeName: string;
  segment: string | null;
  angle: string;
  hypothesis: string;
  hook: string | null;
  format: string | null;
  visualDirection: string | null;
  voiceoverScript: string | null;
  primaryText: string | null;
  headline: string | null;
  offer: string | null;
  cta: string | null;
  whyTesting: string;
  winnerCriteria: string;
  priority: AdLearningPriority;
  priorityReason: string;
}

export interface CreativeBrainAnalysis {
  clientName: string;
  whatWeKnow: string;
  whatWeveTested: string;
  gaps: string;
  recommendations: CreativeRecommendation[];
  inserted: number;
}

// Lucky's own words on scope (2026-09-01): only worry about coming up with
// new hooks/creatives to test within the client's existing campaign
// structure — not proposing a new campaign/audience/budget setup from
// scratch, that's performanceBrain.ts's job. Also explicitly deferred:
// linking a specific lead/booking/revenue outcome back to the ad that
// generated it doesn't exist yet, so this only ever reasons from what Meta
// actually reports (spend, CTR, CPC, "results" = leads/messages) — never
// fabricate qualification/appointment/booking/revenue numbers it wasn't given.
const SYSTEM_PROMPT = `You are the Creative Strategy AI for LS Growth, a lead generation agency running Meta ads for trade and home service businesses in NZ/AU.

Your job is NOT to simply generate ads. Your job is to analyse what has already been tested, identify what the market is responding to, find gaps in the creative testing matrix, and recommend specific new hooks/creatives to test next — within the client's existing campaign structure, not a new campaign from scratch.

CORE OBJECTIVE
Help discover which customer segments, problems, desires, angles, hooks, offers, creative formats, and CTAs produce the best leads. You are only given Meta-level metrics (spend, impressions, CTR, CPC, "results" = leads/messages, cost per result) — you are NOT given qualified-lead, appointment, booking, or revenue data. Never invent or assume those numbers. Optimise your reasoning around lead volume/cost as the best available proxy, but say so explicitly rather than pretending you know quality/booking outcomes.

CREATIVE MEMORY
You'll be given every creative currently live, every creative ever archived (including ones that have since ended), and every learning already banked. Do not recommend testing something as "new" if an equivalent angle/hook has already been tested — check the full history first.

ANALYSIS — when given new data, work through:
1. Compare current performance against past/archived performance.
2. Identify winning patterns and losing patterns.
3. Identify patterns with insufficient data (don't overreact to a handful of leads or <$20 spend).
4. Identify angles/segments/hooks that have not been tested at all — that's the highest-value gap.
5. Identify winning concepts worth iterating further (new hook/format/proof on the same angle) before moving to something completely new.

Distinguish funnel stages when diagnosing: ATTENTION (impressions/reach) → INTEREST (CTR) → ENQUIRY (results/leads) → cost per result. High CTR + few results suggests a post-click/offer problem, not a bad hook. Low CTR + decent cost-per-result suggests the hook needs work while the underlying offer may be fine.

TESTING PRINCIPLES
Prioritise, in this order: (1) expand what's already worked via new hooks/formats/proof on the same angle, (2) fill angle/segment/hook gaps that have never been tested, (3) only then propose something speculative. Do not recommend random variations. When a winning angle exists, explore it through different hooks/formats/visuals/proof/offers before abandoning it. Change one meaningful variable at a time where practical so results stay attributable.

CREATIVE CATEGORIES (use where relevant, don't force every client into every one): Authority, Product/Service, Offer, Social Proof, Problem/Pain, Desire/Outcome, Objection, Education.

ANGLE DEVELOPMENT — map each recommendation through: customer segment → current situation → problem → emotion → desired outcome → objection → reason to believe → offer → creative angle. Ground this in the client's real ideal customer/service details given below — never invent a segment or problem that isn't plausible for this trade.

IMPORTANT RULES
Never fabricate testimonials, results, statistics, customer experiences, services, offers, pricing, guarantees, or claims. Every recommendation needs a strategic reason tied to the real data given, not "it sounds good." Don't kill a pattern prematurely on thin data. Don't keep proposing variations of an angle that's already been thoroughly tested — that's a gap-filling failure, not thoroughness.

Respond with ONLY a JSON object, no markdown fences, no other text:
{
  "what_we_know": "2-4 sentences on what's currently working, what isn't, and any meaningful recent change",
  "what_weve_tested": "a few sentences summarizing the angles/segments/formats/offers/hooks already covered by the live + archived + banked data",
  "gaps": "a few sentences on the most important untested angles/segments/hooks in the creative matrix",
  "recommendations": [
    {
      "creative_name": "short internal label",
      "segment": "customer segment or null",
      "angle": "the marketing angle",
      "hypothesis": "why this should work, grounded in the real data/gap identified",
      "hook": "the opening hook/line" or null,
      "format": "image | video | carousel | before-after | testimonial | etc" or null,
      "visual_direction": "what the creative should show" or null,
      "voiceover_script": "script if video/voiceover, else null",
      "primary_text": "the ad body copy" or null,
      "headline": "the ad headline" or null,
      "offer": "the specific offer/CTA hook" or null,
      "cta": "button/CTA text" or null,
      "why_testing": "the strategic reason, referencing real data or a real gap",
      "winner_criteria": "what result would make this a winner given this client's typical cost/result",
      "priority": "high"|"medium"|"low",
      "priority_reason": "why this priority"
    }
  ]
}
Cap it at 5 recommendations, highest priority first. If there truly isn't enough data or the matrix is already well-covered, return an empty recommendations array rather than inventing filler.`;

function summarizeAds(ads: AdCreativeInsight[]): string {
  return ads
    .filter((a) => a.spend > 0)
    .map((a) => {
      const copy = [a.title, a.body].filter(Boolean).join(" — ") || "no copy on file";
      return `- [${a.campaignName}] "${copy}" (${a.status}): spend $${a.spend.toFixed(2)}, ${a.results ?? 0} results${a.resultType ? ` (${a.resultType.replace(/_/g, " ")})` : ""}, cost/result ${a.costPerResult ? `$${a.costPerResult.toFixed(2)}` : "n/a"}, CTR ${a.ctr.toFixed(2)}%, CPC $${a.cpc.toFixed(2)}`;
    })
    .join("\n");
}

export async function generateCreativeHypotheses(clientId: string): Promise<CreativeBrainAnalysis> {
  const sb = createSupabaseClient();

  const { data: client, error: clientError } = await sb
    .from("lq_clients")
    .select("id, name, trade, meta_ad_account_id")
    .eq("id", clientId)
    .maybeSingle();
  if (clientError || !client) throw new Error(`Unknown client_id "${clientId}"`);
  if (!client.meta_ad_account_id) throw new Error(`${client.name} has no Meta ad account linked yet — set one on Campaign Setup first.`);

  const [ads, { data: brief }, learnings, driveMatches] = await Promise.all([
    getAdCreatives(client.meta_ad_account_id, "last_30d"),
    sb.from("campaign_briefs").select("ideal_customer, budget_targeting, service_details").eq("client_id", clientId).maybeSingle(),
    getAdLearningsForClient(sb, clientId, 30),
    searchDriveDocs(`${client.name} strategy`, 2).catch(() => []),
  ]);

  if (!ads.some((a) => a.spend > 0)) {
    return { clientName: client.name, whatWeKnow: "No live spend in the last 30 days.", whatWeveTested: "", gaps: "", recommendations: [], inserted: 0 };
  }

  await syncAdCreativesArchive(clientId, ads).catch(() => {});
  const archived = await getArchivedCreatives(clientId).catch(() => []);
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
    .map((l) => `- [${l.status}${l.priority ? `, ${l.priority} priority` : ""}${l.confidence ? `, ${l.confidence}` : ""}] ${l.service || "general"} / ${l.segment || "no segment"} / ${l.angle || "no angle"} / hook: ${l.hook || "n/a"}: ${l.observed}${l.next_test ? ` (next test: ${l.next_test})` : ""}`)
    .join("\n") || "No banked creative memory yet.";

  let docsSummary = "No matching strategy docs found in Drive.";
  if (driveMatches.length > 0) {
    const texts = await Promise.all(
      driveMatches.map(async (m) => {
        try {
          const text = await readGoogleDocText(m.id, 2000);
          return `--- ${m.name} ---\n${text}`;
        } catch {
          return null;
        }
      })
    );
    const joined = texts.filter(Boolean).join("\n\n");
    if (joined) docsSummary = joined;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");
  const anthropic = new Anthropic({ apiKey });

  const userPrompt = `Client: ${client.name} (${client.trade || "trade unknown"})

Ideal customer: ${brief?.ideal_customer || "not set"}
Budget + targeting: ${brief?.budget_targeting || "not set"}

Confirmed strategy per service:
${strategySummary}

Relevant strategy docs from Drive:
${docsSummary}

Full creative memory already banked for this client (do not repeat these angles/hooks/next_test ideas):
${learningsSummary}

Live ad-level performance, last 30 days (real creative copy + real numbers):
${summarizeAds(ads)}

Ended/archived ads from this client's full history:
${endedAdsSummary}

Analyse this client's creative testing so far and recommend what to test next.`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3072,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("Unexpected response from AI");

  interface RawRecommendation {
    creative_name?: string; segment?: string | null; angle?: string; hypothesis?: string; hook?: string | null;
    format?: string | null; visual_direction?: string | null; voiceover_script?: string | null; primary_text?: string | null;
    headline?: string | null; offer?: string | null; cta?: string | null; why_testing?: string; winner_criteria?: string;
    priority?: string; priority_reason?: string;
  }
  const parsed = parseJsonResponse<{ what_we_know?: string; what_weve_tested?: string; gaps?: string; recommendations?: RawRecommendation[] }>(text);

  const recommendations: CreativeRecommendation[] = (parsed.recommendations || [])
    .filter((r) => r.angle && r.hypothesis)
    .map((r) => ({
      creativeName: r.creative_name || r.angle || "Untitled test",
      segment: r.segment || null,
      angle: r.angle as string,
      hypothesis: r.hypothesis as string,
      hook: r.hook || null,
      format: r.format || null,
      visualDirection: r.visual_direction || null,
      voiceoverScript: r.voiceover_script || null,
      primaryText: r.primary_text || null,
      headline: r.headline || null,
      offer: r.offer || null,
      cta: r.cta || null,
      whyTesting: r.why_testing || "",
      winnerCriteria: r.winner_criteria || "",
      priority: AD_LEARNING_PRIORITY.includes(r.priority as AdLearningPriority) ? (r.priority as AdLearningPriority) : "medium",
      priorityReason: r.priority_reason || "",
    }));

  // Dedupe against whatever's still sitting unapproved in the queue for this
  // client, same guard used elsewhere in the Brain.
  const { data: existingPending } = await sb
    .from("chat_drafts")
    .select("content, payload")
    .eq("kind", "ad_learning")
    .eq("status", "pending");
  const existingHypotheses = new Set(
    (existingPending || [])
      .filter((d) => (d.payload as { clientId?: string } | null)?.clientId === clientId)
      .map((d) => d.content)
  );

  const toInsert = recommendations.filter((r) => !existingHypotheses.has(r.hypothesis));

  if (toInsert.length > 0) {
    const { error } = await sb.from("chat_drafts").insert(
      toInsert.map((r) => ({
        kind: "ad_learning",
        title: `${r.creativeName} (${r.priority} priority)`,
        content: r.hypothesis,
        status: "pending",
        payload: {
          clientId,
          service: null,
          angle: r.angle,
          creative: r.creativeName,
          offer: r.offer,
          observed: r.hypothesis,
          inference: r.whyTesting,
          nextTest: r.winnerCriteria,
          confidence: "early_signal",
          segment: r.segment,
          hook: r.hook,
          format: r.format,
          headline: r.headline,
          primaryText: r.primaryText,
          cta: r.cta,
          visualDirection: r.visualDirection,
          hypothesis: r.hypothesis,
          priority: r.priority,
          priorityReason: r.priorityReason,
        },
      }))
    );
    if (!error) {
      await notifySlack(`${toInsert.length} new creative test recommendation${toInsert.length === 1 ? "" : "s"} for *${client.name}* — /dashboard/approvals`);
    }
  }

  return {
    clientName: client.name,
    whatWeKnow: parsed.what_we_know || "",
    whatWeveTested: parsed.what_weve_tested || "",
    gaps: parsed.gaps || "",
    recommendations,
    inserted: toInsert.length,
  };
}
