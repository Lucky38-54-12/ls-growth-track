import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "@/lib/supabase";
import { parseJsonResponse } from "@/lib/ai";
import { appendMarkedTextToDoc } from "@/lib/googleDocs";

export interface AdConcept {
  angle: string;
  headline: string;
  primaryText: string;
  creativeDirection: string;
  targeting: string;
  referenceLinks: string[];
}

const SYSTEM_PROMPT = `You write Meta ad concepts for Lucky from LS Growth, a lead generation agency that runs Meta ads for trade and home service businesses in NZ and Australia. You're given a client's already-confirmed Stage 01 strategy brief (offer/pricing, ideal customer, budget/targeting, plus supporting research) — the market research is done, don't redo it, just turn it into ads.

Write exactly 3 distinct Meta ad concepts, meant to run together as a small test set (this is how Lucky actually runs campaigns — 3 ads at a time, not 1). Each must have a genuinely different angle from the other two (e.g. price/offer-led, social proof/trust-led, urgency or a specific pain point) — never 3 versions of the same idea with the wording changed. Ground every ad in the actual offer, price, and customer from the brief, never generic trade-ad filler.

Most of the time all 3 ads should point at the same core audience from the brief with different creative angles — but if the brief's ideal customer or service area genuinely supports it (e.g. a clearly different sub-segment, or a secondary service area worth testing separately), it's fine and expected for one of the 3 to target a narrower or different slice as a deliberate test, not just repeat the same targeting three times for no reason.

For each ad write:
- angle: the hook/angle this ad is testing, one line (e.g. "speed and zero-friction quoting")
- headline: the actual Meta headline, short and punchy
- primaryText: the actual ad copy body a lead would read, 2-4 sentences, direct-response style — a real offer and a real call to action, not vague brand copy
- creativeDirection: what the image or video should actually show, 1-2 sentences, specific enough that a photo/video could be picked or shot from it
- targeting: this specific ad's audience/placement notes — most ads will just restate the brief's core targeting in short form, but say plainly if this ad is testing something narrower/different and why
- referenceLinks: use the web_search tool to actually find 2-3 real links Lucky can open for inspiration on this specific ad's angle/creative — real ad examples (from Facebook Ad Library, YouTube, articles breaking down trade/home-service ads), or real stock/reference footage clips matching the creativeDirection (people-in-them ads are fine, not just B-roll). Every link must come from an actual search result, never invented — if you can't find a good match for one ad after searching, it's fine to return fewer than 3 or an empty list for that ad rather than making one up.

Respond with ONLY a JSON object as your final message, no markdown fences, no other text:
{"ads": [{"angle": "...", "headline": "...", "primaryText": "...", "creativeDirection": "...", "targeting": "...", "referenceLinks": ["...", "..."]}, {"angle": "...", "headline": "...", "primaryText": "...", "creativeDirection": "...", "targeting": "...", "referenceLinks": ["...", "..."]}, {"angle": "...", "headline": "...", "primaryText": "...", "creativeDirection": "...", "targeting": "...", "referenceLinks": ["...", "..."]}]}`;

function buildDocMarkdown(ads: AdConcept[]): string {
  const sections = ads
    .map(
      (ad, i) =>
        `## Ad ${i + 1} — ${ad.angle}\nHeadline: ${ad.headline}\n\nPrimary text: ${ad.primaryText}\n\nCreative direction: ${ad.creativeDirection}\n\nTargeting: ${ad.targeting}${
          ad.referenceLinks.length ? `\n\nReference links:\n${ad.referenceLinks.map((l) => `- ${l}`).join("\n")}` : ""
        }`
    )
    .join("\n\n");
  return `# Ad Concepts\n\n${sections}`;
}

export async function generateAdConcepts(clientId: string): Promise<{ ads: AdConcept[]; clientName: string }> {
  const sb = createSupabaseClient();

  const { data: client, error: clientError } = await sb
    .from("lq_clients")
    .select("id, name")
    .eq("id", clientId)
    .maybeSingle();
  if (clientError || !client) throw new Error(`Unknown client_id "${clientId}"`);

  const { data: brief, error: briefError } = await sb
    .from("campaign_briefs")
    .select(
      "offer_pricing, ideal_customer, budget_targeting, job_value_margins, competitor_research, lead_qualification_criteria, retargeting_strategy, google_doc_id, google_doc_url"
    )
    .eq("client_id", clientId)
    .maybeSingle();
  if (briefError || !brief) throw new Error(`No Stage 01 strategy brief yet for "${client.name}" — generate that first.`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");
  const anthropic = new Anthropic({ apiKey });

  const userPrompt = `Client: ${client.name}

CONFIRMED STAGE 01 BRIEF:
Offer + pricing: ${brief.offer_pricing}
Ideal customer: ${brief.ideal_customer}
Budget + targeting: ${brief.budget_targeting}
Job value & margins: ${brief.job_value_margins}
Competitor research: ${brief.competitor_research}
Lead qualification criteria: ${brief.lead_qualification_criteria}
Retargeting strategy: ${brief.retargeting_strategy}

Write the 3 ad concepts.`;

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

// Generates 3 ad concepts and saves them onto the client's existing
// campaign_briefs row (overwrites any prior set — regenerating is meant to
// replace the test set, not accumulate old ones). Appends to the same
// per-client master doc the strategy brief already writes to.
export async function generateAndSaveAdConcepts(clientId: string) {
  const { ads, clientName } = await generateAdConcepts(clientId);
  const sb = createSupabaseClient();

  const { data, error } = await sb
    .from("campaign_briefs")
    .update({ ad_concepts: ads, updated_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (data.google_doc_id) {
    await appendMarkedTextToDoc(data.google_doc_id, buildDocMarkdown(ads));
  }

  return data;
}
