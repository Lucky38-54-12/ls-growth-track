import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "@/lib/supabase";

export interface AdIdea {
  headline: string;
  angle: string;
  offer: string | null;
  format: string;
  why_it_works: string;
  source_url: string | null;
  source_business: string | null;
}

export interface AdResearchResult {
  summary: string;
  ads: AdIdea[];
  source: "live_ad_library" | "ai_web_search";
  researchedAt?: string;
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// Real ad data (actual live ads, pulled by hand from the Meta Ad Library —
// see supabase_migration_ad_research_cache.sql for why this can't be fetched
// live on every request: Meta's Ad Library API doesn't cover NZ/AU commercial
// ads, and the public site's real results sit behind an authenticated
// session we don't run unattended). Falls back to the AI web-search summary
// for any niche/location that hasn't been researched this way yet.
async function findCachedRealAds(niche: string, location: string): Promise<AdResearchResult | null> {
  const sb = createSupabaseClient();
  const { data } = await sb
    .from("ad_research_cache")
    .select("summary, ads, researched_at")
    .eq("niche_key", normalizeKey(niche))
    .eq("location_key", normalizeKey(location || "New Zealand"))
    .maybeSingle();

  if (!data) return null;
  return { summary: data.summary, ads: data.ads as AdIdea[], source: "live_ad_library", researchedAt: data.researched_at };
}

function parseJsonResponse<T>(text: string): T {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Could not parse AI response as JSON: ${text.slice(0, 200)}`);
  }
}

const SYSTEM_PROMPT = `You research paid Meta ads for Lucky from LS Growth, a lead generation agency that runs Meta ads for trade and home service businesses in NZ and Australia. He gives you a trade/niche (optionally with a sub-focus and location) and wants to know what ad angles, hooks, and offers are actually working right now on the Meta paid ads side for that niche, so he can adapt the best ones for his own clients' campaigns.

Use the web_search tool to find real, current examples, focused only on Meta paid ads — not Google or other platforms. Good sources: Meta Ad Library (facebook.com/ads/library — search by the trade/niche and country), agency case studies or blog posts specifically about Meta ad campaigns for trades/home services, and competitor pages running Meta ads. Do several searches with different phrasings (e.g. "electrician meta ads library nz", "bathroom renovation meta ads examples", "[niche] meta ad library", "[niche] meta ads case study") before answering — don't stop after one search.

For each ad example you find, extract:
- headline: the actual hook/headline text if you found real copy, otherwise your best reconstruction of the angle as a short headline
- angle: the psychological/marketing angle in a few words (e.g. "urgency + free quote", "before/after social proof", "price transparency")
- offer: the specific offer/CTA if there is one (e.g. "free quote within 24hrs"), or null
- format: image, video, carousel, before/after photo, testimonial, etc — best guess if not stated
- why_it_works: one sentence on why this angle likely converts for this niche
- source_url: the URL you found it or evidence of it at, or null if you're inferring a common pattern rather than citing one specific ad
- source_business: the business/advertiser name if known, or null

Only report source_url and source_business when you actually found that specific thing via search — never invent a URL or business name. It's fine to include a pattern you're confident is common in the niche even without one specific source, just leave source_url and source_business null in that case and say so implicitly by their absence.

Aim for 6-10 ad ideas, ordered with the strongest / most well-evidenced first.

After searching, respond with ONLY a JSON object as your final message, no markdown fences, no other text:
{"summary": "2-3 sentence overview of what's working in this niche right now", "ads": [{"headline": "...", "angle": "...", "offer": "..." or null, "format": "...", "why_it_works": "...", "source_url": "..." or null, "source_business": "..." or null}]}`;

export async function findWorkingAds(niche: string, location: string): Promise<AdResearchResult> {
  const cached = await findCachedRealAds(niche, location);
  if (cached) return cached;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });

  const userPrompt = `Niche/trade: ${niche}
Location: ${location || "New Zealand"}

Find ads that are currently working for this niche and give me ideas I can adapt.`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 } as const],
  });

  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<Partial<AdResearchResult>>(text);
  if (!parsed.ads?.length) throw new Error("AI response missing ad ideas");

  return {
    summary: parsed.summary?.trim() || "",
    ads: parsed.ads.map((a) => ({
      headline: a.headline || "",
      angle: a.angle || "",
      offer: a.offer || null,
      format: a.format || "",
      why_it_works: a.why_it_works || "",
      source_url: a.source_url || null,
      source_business: a.source_business || null,
    })),
    source: "ai_web_search",
  };
}
