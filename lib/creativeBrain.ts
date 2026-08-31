import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "./supabase";
import { parseJsonResponse } from "./ai";
import { getAdCreatives, AdCreativeInsight } from "./metaAds";
import { getAdLearningsForClient, AD_LEARNING_CONFIDENCE, AdLearningConfidence } from "./adLearnings";
import { syncAdCreativesArchive, getArchivedCreatives } from "./adCreativesArchive";
import { searchDriveDocs, readGoogleDocText } from "./googleDocs";
import { notifySlack } from "./slackNotify";

export interface CreativeHypothesis {
  service: string | null;
  angle: string | null;
  creative: string | null;
  offer: string | null;
  observed: string;
  inference: string | null;
  nextTest: string | null;
  confidence: AdLearningConfidence;
}

const SYSTEM_PROMPT = `You are the Creative Brain for Lucky at LS Growth, a lead generation agency running Meta ads for trade and home service businesses in NZ/AU. Given one client's real, live ad-level Meta performance (actual creative copy, not just campaign names) alongside their confirmed strategy docs and every hook/angle/offer already banked as a past learning, produce a short list of hypotheses: "X isn't working because Y, so try Z."

Treat every ad as a hypothesis test: which angle, which hook/creative, which offer, tested against which audience. Compare ads within the same service against each other to isolate what's actually different between the winner and the loser (same offer but different hook → hook is the variable; same hook but different offer → offer is the variable). Never repeat a next_test that's already listed as a past learning's next_test or angle for this client — check the banked learnings before proposing anything.

Grade confidence honestly: "early_signal" for a handful of leads or under ~$20 spend on that specific ad, "promising" for a consistent pattern over more spend, "strong_evidence" for a clear pattern across multiple ads/weeks, "proven" only for something already validated repeatedly. If the data is too thin to say anything real (no ads, or every ad under $10 spend), return an empty hypotheses array rather than inventing a pattern.

Respond with ONLY a JSON object, no markdown fences, no other text:
{"hypotheses": [{"service": "..." or null, "angle": "..." or null, "creative": "..." or null, "offer": "..." or null, "observed": "...", "inference": "..." or null, "next_test": "..." or null, "confidence": "early_signal"|"promising"|"strong_evidence"|"proven"}]}`;

function summarizeAds(ads: AdCreativeInsight[]): string {
  return ads
    .filter((a) => a.spend > 0)
    .map((a) => {
      const copy = [a.title, a.body].filter(Boolean).join(" — ") || "no copy on file";
      return `- [${a.campaignName}] "${copy}" (${a.status}): spend $${a.spend.toFixed(2)}, ${a.results ?? 0} results${a.resultType ? ` (${a.resultType.replace(/_/g, " ")})` : ""}, cost/result ${a.costPerResult ? `$${a.costPerResult.toFixed(2)}` : "n/a"}, CTR ${a.ctr.toFixed(2)}%, CPC $${a.cpc.toFixed(2)}`;
    })
    .join("\n");
}

export async function generateCreativeHypotheses(clientId: string): Promise<{ clientName: string; hypotheses: CreativeHypothesis[]; inserted: number }> {
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
    getAdLearningsForClient(sb, clientId, 20),
    searchDriveDocs(`${client.name} strategy`, 2).catch(() => []),
  ]);

  if (!ads.some((a) => a.spend > 0)) {
    return { clientName: client.name, hypotheses: [], inserted: 0 };
  }

  // Mirror this pull into the permanent archive (facts, not AI judgment —
  // no approval needed), then pull the archive back so the model sees ads
  // that have since ended/dropped out of Meta's 30-day window too, not just
  // what's live right now.
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
    .map((l) => `- [${l.confidence}] ${l.service || "general"} / ${l.angle || "no angle tagged"}: ${l.observed}${l.inference ? ` → ${l.inference}` : ""}${l.next_test ? ` (next test: ${l.next_test})` : ""}`)
    .join("\n") || "No banked learnings yet.";

  // Drive docs are best-effort context, same as the Brain chat's own search —
  // a missing/unreadable doc should never block generating hypotheses.
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

Past banked learnings for this client (do not repeat these next_test ideas):
${learningsSummary}

Live ad-level performance, last 30 days (real creative copy + real numbers):
${summarizeAds(ads)}

Ended/archived ads from this client's full history (dropped out of the 30-day window or since removed in Meta, but recorded permanently the first time they were seen — do not repeat an angle/offer that already ended badly here):
${endedAdsSummary}

Diagnose what's working and what isn't at the creative level, and propose specific next hypotheses to test.`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<{ hypotheses?: Array<{ service?: string | null; angle?: string | null; creative?: string | null; offer?: string | null; observed?: string; inference?: string | null; next_test?: string | null; confidence?: string }> }>(text);
  const hypotheses: CreativeHypothesis[] = (parsed.hypotheses || [])
    .filter((h) => h.observed)
    .map((h) => ({
      service: h.service || null,
      angle: h.angle || null,
      creative: h.creative || null,
      offer: h.offer || null,
      observed: h.observed as string,
      inference: h.inference || null,
      nextTest: h.next_test || null,
      confidence: AD_LEARNING_CONFIDENCE.includes(h.confidence as AdLearningConfidence) ? (h.confidence as AdLearningConfidence) : "early_signal",
    }));

  // Same "don't re-propose what's already sitting in the queue" guard used
  // elsewhere in the Brain — dedupe on the observed text, not just title,
  // since ad_learning drafts don't currently carry a separate title field.
  const { data: existingPending } = await sb
    .from("chat_drafts")
    .select("content, payload")
    .eq("kind", "ad_learning")
    .eq("status", "pending");
  const existingObserved = new Set(
    (existingPending || [])
      .filter((d) => (d.payload as { clientId?: string } | null)?.clientId === clientId)
      .map((d) => d.content)
  );

  const toInsert = hypotheses.filter((h) => !existingObserved.has(h.observed));

  if (toInsert.length > 0) {
    const { error } = await sb.from("chat_drafts").insert(
      toInsert.map((h) => ({
        kind: "ad_learning",
        title: `${h.service || client.trade || "General"}: ${h.angle || "new hypothesis"}`,
        content: h.observed,
        status: "pending",
        payload: {
          clientId,
          service: h.service,
          angle: h.angle,
          creative: h.creative,
          offer: h.offer,
          observed: h.observed,
          inference: h.inference,
          nextTest: h.nextTest,
          confidence: h.confidence,
        },
      }))
    );
    if (!error) {
      await notifySlack(`${toInsert.length} new creative hypothesis${toInsert.length === 1 ? "" : "es"} for *${client.name}* — /dashboard/approvals`);
    }
  }

  return { clientName: client.name, hypotheses, inserted: toInsert.length };
}
