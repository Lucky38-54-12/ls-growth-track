import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "@/lib/supabase";
import { parseJsonResponse } from "@/lib/ai";
import { appendMarkedTextToDoc } from "@/lib/googleDocs";
import { ServiceStrategy } from "@/lib/campaignBrief";

export interface AdConcept {
  angle: string;
  headline: string;
  primaryText: string;
  creativeDirection: string;
  targeting: string;
  referenceLinks: string[];
}

const SYSTEM_PROMPT = `You write Meta ad concepts for Lucky from LS Growth, a lead generation agency that runs Meta ads for trade and home service businesses in NZ and Australia. You're given a client's already-confirmed Stage 01 strategy for ONE specific service (offer/pricing, plus supporting research for that service) and the client's shared ideal customer/budget — the market research is done, don't redo it, just turn it into ads for this one service.

Write exactly 3 distinct Meta ad concepts for this service, meant to run together as a small test set (this is how Lucky actually runs campaigns — 3 ads at a time, not 1). Each must have a genuinely different angle from the other two (e.g. price/offer-led, social proof/trust-led, urgency or a specific pain point) — never 3 versions of the same idea with the wording changed. Ground every ad in the actual offer, price, and customer from the brief, never generic trade-ad filler.

Most of the time all 3 ads should point at the same core audience with different creative angles — but if the ideal customer or service area genuinely supports it (e.g. a clearly different sub-segment, or a secondary service area worth testing separately), it's fine and expected for one of the 3 to target a narrower or different slice as a deliberate test, not just repeat the same targeting three times for no reason.

For each ad write:
- angle: the hook/angle this ad is testing, one line (e.g. "speed and zero-friction quoting")
- headline: the actual Meta headline, short and punchy
- primaryText: the actual ad copy body a lead would read, 2-4 sentences, direct-response style — a real offer and a real call to action, not vague brand copy
- creativeDirection: what the image or video should actually show, 1-2 sentences, specific enough that a photo/video could be picked or shot from it
- targeting: this specific ad's audience/placement notes — most ads will just restate the shared targeting in short form, but say plainly if this ad is testing something narrower/different and why
- referenceLinks: use the web_search tool to find 2-3 real reference links Lucky can actually open for this ad's creative. Only two kinds of link are acceptable: (1) a specific video post on Instagram (reel/post), TikTok, or Facebook (video/reel) — the actual post URL, matching the creativeDirection; or (2) a specific static before/after or finished-result image matching the creativeDirection — a real Instagram/Facebook photo post, Pinterest pin, or project gallery page, not a generic stock photo site homepage. NEVER return YouTube, a blog post, an article, a "how to run ads" guide, a marketing-tips page, a stock-footage site's homepage, or any other link that isn't itself a specific IG/TikTok/Facebook post or a specific real image — those are useless to him and worse than returning nothing. Search with platform-specific terms (e.g. site:instagram.com/reel, site:tiktok.com, site:facebook.com, "before after deck instagram") rather than generic advice queries. If you can't find real matching links for an ad after searching, return an empty list for it rather than substituting something off-platform.

If Lucky's own notes (given below, when present) already describe a specific ad idea he wants for this service — an angle, a video concept, or actual reference links he already found — build that as one of the 3 ads using his idea, not a different angle you'd have picked yourself. Keep any links he already gave verbatim in that ad's referenceLinks (still fine to search and add 1-2 more alongside them). Fill the other ads around it as normal.

Respond with ONLY a JSON object as your final message, no markdown fences, no other text:
{"ads": [{"angle": "...", "headline": "...", "primaryText": "...", "creativeDirection": "...", "targeting": "...", "referenceLinks": ["...", "..."]}, {"angle": "...", "headline": "...", "primaryText": "...", "creativeDirection": "...", "targeting": "...", "referenceLinks": ["...", "..."]}, {"angle": "...", "headline": "...", "primaryText": "...", "creativeDirection": "...", "targeting": "...", "referenceLinks": ["...", "..."]}]}`;

function buildDocMarkdown(service: string, ads: AdConcept[]): string {
  const sections = ads
    .map(
      (ad, i) =>
        `## Ad ${i + 1} — ${ad.angle}\nHeadline: ${ad.headline}\n\nPrimary text: ${ad.primaryText}\n\nCreative direction: ${ad.creativeDirection}\n\nTargeting: ${ad.targeting}${
          ad.referenceLinks.length ? `\n\nReference links:\n${ad.referenceLinks.map((l) => `- ${l}`).join("\n")}` : ""
        }`
    )
    .join("\n\n");
  return `# Ad Concepts — ${service}\n\n${sections}`;
}

export async function generateAdConcepts(clientId: string, service: string): Promise<{ ads: AdConcept[]; clientName: string }> {
  const sb = createSupabaseClient();

  const { data: client, error: clientError } = await sb
    .from("lq_clients")
    .select("id, name")
    .eq("id", clientId)
    .maybeSingle();
  if (clientError || !client) throw new Error(`Unknown client_id "${clientId}"`);

  const { data: brief, error: briefError } = await sb
    .from("campaign_briefs")
    .select("ideal_customer, budget_targeting, service_details, google_doc_id, google_doc_url")
    .eq("client_id", clientId)
    .maybeSingle();
  if (briefError || !brief) throw new Error(`No Stage 01 strategy brief yet for "${client.name}" — generate that first.`);

  const serviceDetails = (brief.service_details || {}) as Record<string, ServiceStrategy>;
  const strategy = serviceDetails[service];
  if (!strategy) throw new Error(`No strategy generated yet for "${service}" — generate that first.`);

  // Same source campaignBrief.ts reads business info from — pulling
  // extra_context again here so any creative idea Lucky has already jotted
  // down for this client (a specific ad angle, a video concept, reference
  // links he found himself) reaches ad-concept generation directly, instead
  // of only surviving if it happened to get folded into the Stage 01 brief
  // text.
  const { data: configs } = await sb
    .from("lq_client_configs")
    .select("business_info, status, version")
    .eq("client_id", clientId)
    .order("version", { ascending: false });
  const config = (configs || []).find((c) => c.status === "published") || (configs || [])[0] || null;
  const extraContext = (config?.business_info as { extra_context?: string } | null)?.extra_context || "";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");
  const anthropic = new Anthropic({ apiKey });

  const userPrompt = `Client: ${client.name}
Service this batch of ads is for: ${service}

SHARED (applies across all of this client's services):
Ideal customer: ${brief.ideal_customer}
Budget + targeting: ${brief.budget_targeting}

STRATEGY FOR "${service}":
Offer + pricing: ${strategy.offerPricing}
Job value & margins: ${strategy.jobValueMargins}
Competitor research: ${strategy.competitorResearch}
Lead qualification criteria: ${strategy.leadQualificationCriteria}
Retargeting strategy: ${strategy.retargetingStrategy}
${extraContext ? `\nLucky's own notes on this client (may include a specific ad idea for this service to use as-is — see instructions above):\n${extraContext}\n` : ""}
Write the 3 ad concepts for "${service}".`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 } as const],
  });

  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<{ ads?: Partial<AdConcept>[] }>(text);
  const ads: AdConcept[] = (parsed.ads || []).map((a) => ({
    angle: a.angle || "",
    headline: a.headline || "",
    primaryText: a.primaryText || "",
    creativeDirection: a.creativeDirection || "",
    targeting: a.targeting || "",
    referenceLinks: Array.isArray(a.referenceLinks) ? a.referenceLinks.filter((l): l is string => typeof l === "string") : [],
  }));

  if (ads.length !== 3 || ads.some((a) => !a.headline || !a.primaryText)) {
    throw new Error("AI response did not return 3 complete ad concepts");
  }

  return { ads, clientName: client.name };
}

// Generates 3 ad concepts for one service and merges them into that
// service's slot in campaign_briefs.service_details (overwrites that
// service's prior set — regenerating is meant to replace the test set for
// this service, not accumulate old ones, and doesn't touch other services'
// ads). Appends to the same per-client master doc the strategy already
// writes to.
export async function generateAndSaveAdConcepts(clientId: string, service: string) {
  const { ads, clientName } = await generateAdConcepts(clientId, service);
  const sb = createSupabaseClient();

  const { data: existing, error: fetchError } = await sb
    .from("campaign_briefs")
    .select("service_details, google_doc_id")
    .eq("client_id", clientId)
    .maybeSingle();
  if (fetchError || !existing) throw new Error(fetchError?.message || "Brief not found");

  const serviceDetails = { ...(existing.service_details as Record<string, ServiceStrategy & { ad_concepts?: AdConcept[] }>) };
  serviceDetails[service] = { ...serviceDetails[service], ad_concepts: ads };

  const { data, error } = await sb
    .from("campaign_briefs")
    .update({ service_details: serviceDetails, updated_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (existing.google_doc_id) {
    await appendMarkedTextToDoc(existing.google_doc_id, buildDocMarkdown(service, ads));
  }

  return data;
}
