import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "@/lib/supabase";
import { parseJsonResponse } from "@/lib/ai";
import { createDocWithId, appendMarkedTextToDocTab } from "@/lib/googleDocs";
import { notifySlack } from "@/lib/slack";
import { findWorkingAds } from "@/lib/adResearch";

// One service's full creative testing plan — this is the actual unit of
// work Lucky hands to a media buyer/creative person. Replaces the old
// split of a prose "Stage 01 strategy" (ServiceStrategy) generated first,
// then exactly-3 generic AdConcepts generated in a second separate step —
// both steps needed the same research and were artificially split. Ad count
// is deliberately NOT fixed at 3: some services only support 2 genuinely
// differentiated hypotheses, some support 4 — see SYSTEM_PROMPT.
export interface CreativeReference {
  source: string; // e.g. "Meta Ad Library", "YouTube", "Competitor website"
  url: string | null; // never invented — null when the model is describing a pattern, not one specific ad
  whatTheyreDoing: string;
  whatWeCanTake: string;
}

export interface AdConcept {
  name: string; // short concept label, e.g. "Emotional Transformation Video"
  format: string; // free text — "Video", "Before/After", "Testimonial", etc, whatever actually fits
  angle: string;
  hook: string;
  first3Seconds: string;
  creativeConcept: string; // visual structure / what's shown, specific enough to brief a shoot from
  mainMessage: string;
  offer: string;
  cta: string;
  copyFramework: string; // e.g. "PAS", "AIDA", "BAB", "Proof → Outcome → Offer"
  hypothesis: string;
  whyTesting: string;
  creativeReference: CreativeReference | null;
}

export interface MarketResearch {
  keyFindings: string;
  commonOffers: string;
  commonMessaging: string;
  creativePatterns: string;
  opportunities: string;
}

export interface ServiceCreativePlan {
  customer: string;
  customerProblem: string;
  desiredOutcome: string;
  keyObjections: string;
  recommendedOffer: string;
  marketResearch: MarketResearch;
  ads: AdConcept[];
  flags: string[]; // important missing info, flagged rather than guessed
}

export interface CampaignBriefResult {
  idealCustomer: string;
  budgetTargeting: string;
  service: string;
  plan: ServiceCreativePlan;
  docMarkdown: string;
  clientName: string;
}

const SYSTEM_PROMPT = `You are the Campaign Setup engine for Lucky at LS Growth, a lead generation agency running Meta ads for trade and home service businesses in NZ/AU. Given one client and ONE of their services, you produce a practical creative testing plan he can hand directly to a media buyer or creative person — not a strategy document.

You'll be given the client's trade, service area(s), full service list, whatever business info/Client Marketing Brain facts are already on file (pricing, competitors, target audience — treat these as ground truth, never contradict or re-invent them), and which one service to build this plan for. Use the web_search tool to research THIS specific service in THIS specific market before writing anything: real competitor ads/offers/messaging (Meta Ad Library, competitor websites, YouTube, TikTok/Reels), what's overused, what looks interesting, what hooks/formats/offers keep appearing. Do several searches with different phrasings — don't stop after one search. You're also given pre-fetched real ad research below when available; use real source_urls from it as creative references, never invent a URL yourself.

Do NOT copy competitor ads. Extract the underlying marketing principle and create an original concept for THIS client.

For this one service, work out:
1. Who specifically buys this service (customer)
2. What outcome they actually want (desiredOutcome)
3. What problem/situation puts them in-market for it (customerProblem)
4. Why they might hesitate (keyObjections)
5. The strongest REALISTIC offer/response mechanism — do NOT default to "Free Quote." Consider free consultation, free site/design assessment, fixed-price package, a genuine discount/bonus if the client plausibly offers one, free measurement, or just a direct enquiry/quote if no offer is stronger than the service itself. Never invent a discount, guarantee, or result the client hasn't actually confirmed — if nothing beats a plain enquiry, say so and sell the outcome instead (recommendedOffer).

Then write marketResearch for this service: keyFindings (what you actually found), commonOffers, commonMessaging, creativePatterns (formats/hooks that keep appearing), opportunities (a gap or angle competitors aren't using).

Then write 2 to 4 creative concepts (ads) for this service — normally 3, fewer if a genuine 3rd/4th differentiated hypothesis doesn't exist for this service, more only if a real 4th hypothesis is worth testing. Each ad must test something DIFFERENT — a different angle, offer, hook, format, or customer motivation. Never produce near-duplicate ads with reworded copy. A useful default spread (adapt or drop any part that doesn't fit this service):
- One VIDEO concept (talking head, UGC, project walkthrough, problem/solution, founder, transformation story — pick what fits)
- One BEFORE/AFTER or visual-proof concept (transformation, completed project, customer result) — if genuinely not appropriate for this service, replace with another strong format instead of forcing it
- One OFFER / problem / social-proof / different-angle concept — a distinct third hypothesis, not another generic ad

For each ad write: name (short concept label), format, angle, hook, first3Seconds (what the viewer sees/hears immediately), creativeConcept (the visual structure — specific enough to shoot from), mainMessage, offer (which specific offer this ad tests — vary offers across the set where it makes sense, don't put the same offer on every ad by default), cta, copyFramework (choose PAS / AIDA / BAB / Proof→Outcome→Offer / Hook→Problem→Solution→Proof→CTA / or another framework — whatever fits this concept, don't force the same one on every ad), hypothesis (a specific, falsifiable claim — e.g. "A visual transformation combined with an emotional hook will attract higher-intent homeowners than generic service messaging," never just "video ad about X"), whyTesting (why this hypothesis is worth testing for this client/service specifically), and creativeReference when you have a REAL example backing the concept (source, url — null if you're describing a pattern rather than one specific ad you found, whatTheyreDoing, whatWeCanTake — the adapted principle, not a copy instruction).

Also write the SHARED fields (apply to the whole client, not just this service — write these considering the client's full service list): idealCustomer (who buys across their services and where, one line) and budgetTargeting (what to optimize for, a concrete starting budget, core targeting approach, one line each combined).

Finally, flags: a list of short strings for anything important you couldn't confirm and are NOT willing to guess (e.g. "No confirmed offer on file — used direct enquiry as the CTA," "Service area not set — assumed [region] from client name/trade, confirm this"). Empty array if nothing to flag.

Respond with ONLY a JSON object as your final message, no markdown fences, no other text:
{"idealCustomer": "...", "budgetTargeting": "...", "customer": "...", "customerProblem": "...", "desiredOutcome": "...", "keyObjections": "...", "recommendedOffer": "...", "marketResearch": {"keyFindings": "...", "commonOffers": "...", "commonMessaging": "...", "creativePatterns": "...", "opportunities": "..."}, "ads": [{"name": "...", "format": "...", "angle": "...", "hook": "...", "first3Seconds": "...", "creativeConcept": "...", "mainMessage": "...", "offer": "...", "cta": "...", "copyFramework": "...", "hypothesis": "...", "whyTesting": "...", "creativeReference": {"source": "...", "url": "..." or null, "whatTheyreDoing": "...", "whatWeCanTake": "..."} or null}], "flags": ["..."]}`;

function isPlausibleUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function buildDocMarkdown(service: string, idealCustomer: string, budgetTargeting: string, plan: ServiceCreativePlan, includeShared: boolean): string {
  const shared = includeShared
    ? `## Ideal Customer\n${idealCustomer || "—"}\n\n## Budget + Targeting\n${budgetTargeting || "—"}\n\n`
    : "";

  const mr = plan.marketResearch;
  const marketResearchBlock = `## Market Research\nKey findings: ${mr.keyFindings || "—"}\nCommon offers: ${mr.commonOffers || "—"}\nCommon messaging: ${mr.commonMessaging || "—"}\nCreative patterns: ${mr.creativePatterns || "—"}\nOpportunities: ${mr.opportunities || "—"}\n\n`;

  const serviceBlock = `## Customer\n${plan.customer || "—"}\n\n## Customer Problem\n${plan.customerProblem || "—"}\n\n## Desired Outcome\n${plan.desiredOutcome || "—"}\n\n## Key Objections\n${plan.keyObjections || "—"}\n\n## Recommended Offer\n${plan.recommendedOffer || "—"}\n\n`;

  const adsBlock = plan.ads
    .map((ad, i) => {
      const ref = ad.creativeReference
        ? `\nCreative reference: ${ad.creativeReference.source}${ad.creativeReference.url ? ` — ${ad.creativeReference.url}` : ""}\nWhat they're doing: ${ad.creativeReference.whatTheyreDoing}\nWhat we can take: ${ad.creativeReference.whatWeCanTake}`
        : "";
      return `## Ad ${i + 1} — ${ad.name}\nFormat: ${ad.format}\nAngle: ${ad.angle}\nHook: ${ad.hook}\nFirst 3 seconds: ${ad.first3Seconds}\nCreative concept: ${ad.creativeConcept}\nMain message: ${ad.mainMessage}\nOffer: ${ad.offer}\nCTA: ${ad.cta}\nCopy framework: ${ad.copyFramework}\nHypothesis: ${ad.hypothesis}\nWhy we're testing it: ${ad.whyTesting}${ref}`;
    })
    .join("\n\n");

  const flagsBlock = plan.flags.length ? `## Flagged — Missing Info\n${plan.flags.map((f) => `- ${f}`).join("\n")}\n\n` : "";

  return `# Campaign Setup — ${service}\n\n${shared}${marketResearchBlock}${serviceBlock}${flagsBlock}${adsBlock}`;
}

export async function generateCampaignBrief(clientId: string, service: string): Promise<CampaignBriefResult> {
  const sb = createSupabaseClient();

  const { data: client, error: clientError } = await sb
    .from("lq_clients")
    .select("id, name, trade")
    .eq("id", clientId)
    .maybeSingle();
  if (clientError || !client) throw new Error(`Unknown client_id "${clientId}"`);

  const { data: configs } = await sb
    .from("lq_client_configs")
    .select("business_info, services, service_areas, status, version")
    .eq("client_id", clientId)
    .order("version", { ascending: false });
  const config =
    (configs || []).find((c) => c.status === "published") || (configs || [])[0] || null;

  const businessInfo = (config?.business_info || {}) as {
    description?: string;
    proof_point?: string;
    website_url?: string;
    extra_context?: string;
    pricing?: string;
    competitors?: string;
    target_audience?: string;
  };
  const services: string[] = config?.services || [];
  const serviceAreas: string[] = config?.service_areas || [];

  // Real pre-fetched ad research (same tool behind /dashboard/meta-ads'
  // Research tab) — a hand-verified Ad Library cache when one exists for
  // this niche, otherwise a careful AI web search that never invents a
  // source_url. Gives the model real candidate creativeReference material
  // on top of whatever it finds itself via the web_search tool below.
  let researchBlock = "";
  try {
    const research = await findWorkingAds(`${service} — ${client.trade || ""}`.trim(), serviceAreas.join(", "));
    const adsList = research.ads
      .slice(0, 8)
      .map((a) => `- angle: ${a.angle} | headline: ${a.headline} | offer: ${a.offer || "n/a"} | format: ${a.format} | source_url: ${a.source_url || "none — do not use as a reference url"}`)
      .join("\n");
    researchBlock = `\nPRE-FETCHED REAL AD RESEARCH FOR THIS NICHE (${research.source === "live_ad_library" ? "verified Ad Library cache" : "AI web search, source_url only present when actually found"}):\n${research.summary}\n${adsList}\n`;
  } catch {
    // Non-fatal — the model still has the web_search tool itself.
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");
  const anthropic = new Anthropic({ apiKey });

  const userPrompt = `Client: ${client.name}
Trade: ${client.trade || "unknown — infer from the info below"}
Service area(s): ${serviceAreas.length ? serviceAreas.join(", ") : "not set — infer a reasonable NZ/AU region if the trade/name implies one, otherwise flag it"}
Full service list: ${services.length ? services.join(", ") : "none listed"}
Service to build this creative testing plan for: ${service}
Business description on file: ${businessInfo.description || "none"}
Proof point on file: ${businessInfo.proof_point || "none"}
Website: ${businessInfo.website_url || "none"}
Extra context: ${businessInfo.extra_context || "none"}

Client Marketing Brain (persistent facts Lucky already confirmed — treat as ground truth, don't re-research or contradict, only use web_search to fill in what's NOT covered here):
Pricing & offers on file: ${businessInfo.pricing || "none — do not invent a price or discount, flag this instead"}
Known competitors: ${businessInfo.competitors || "none — research who's visible in this market"}
Target audience on file: ${businessInfo.target_audience || "none — infer from the business/service"}
${researchBlock}
Build the creative testing plan for "${service}".`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 } as const],
  });

  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<{
    idealCustomer?: string;
    budgetTargeting?: string;
    customer?: string;
    customerProblem?: string;
    desiredOutcome?: string;
    keyObjections?: string;
    recommendedOffer?: string;
    marketResearch?: Partial<MarketResearch>;
    ads?: Partial<AdConcept>[];
    flags?: string[];
  }>(text);

  const idealCustomer = parsed.idealCustomer || "";
  const budgetTargeting = parsed.budgetTargeting || "";

  const ads: AdConcept[] = (parsed.ads || []).map((a) => {
    let creativeReference: CreativeReference | null = null;
    if (a.creativeReference && typeof a.creativeReference === "object") {
      const ref = a.creativeReference as Partial<CreativeReference>;
      const url = typeof ref.url === "string" && isPlausibleUrl(ref.url) ? ref.url : null;
      creativeReference = {
        source: ref.source || "",
        url,
        whatTheyreDoing: ref.whatTheyreDoing || "",
        whatWeCanTake: ref.whatWeCanTake || "",
      };
    }
    return {
      name: a.name || "",
      format: a.format || "",
      angle: a.angle || "",
      hook: a.hook || "",
      first3Seconds: a.first3Seconds || "",
      creativeConcept: a.creativeConcept || "",
      mainMessage: a.mainMessage || "",
      offer: a.offer || "",
      cta: a.cta || "",
      copyFramework: a.copyFramework || "",
      hypothesis: a.hypothesis || "",
      whyTesting: a.whyTesting || "",
      creativeReference,
    };
  });

  const plan: ServiceCreativePlan = {
    customer: parsed.customer || "",
    customerProblem: parsed.customerProblem || "",
    desiredOutcome: parsed.desiredOutcome || "",
    keyObjections: parsed.keyObjections || "",
    recommendedOffer: parsed.recommendedOffer || "",
    marketResearch: {
      keyFindings: parsed.marketResearch?.keyFindings || "",
      commonOffers: parsed.marketResearch?.commonOffers || "",
      commonMessaging: parsed.marketResearch?.commonMessaging || "",
      creativePatterns: parsed.marketResearch?.creativePatterns || "",
      opportunities: parsed.marketResearch?.opportunities || "",
    },
    ads,
    flags: Array.isArray(parsed.flags) ? parsed.flags.filter((f): f is string => typeof f === "string") : [],
  };

  if (!idealCustomer || !budgetTargeting || !plan.customer || ads.length < 2 || ads.some((a) => !a.name || !a.hook)) {
    throw new Error("AI response missing required campaign setup fields");
  }

  return {
    idealCustomer,
    budgetTargeting,
    service,
    plan,
    docMarkdown: buildDocMarkdown(service, idealCustomer, budgetTargeting, plan, true),
    clientName: client.name,
  };
}

// Generates a fresh creative testing plan for one service and merges it
// into the client's campaign_briefs row (status reset to "draft" — any
// prior approval doesn't carry over automatically since the content just
// changed). idealCustomer/budgetTargeting are shared across services — only
// written the first time (row doesn't exist yet or they're still empty),
// never silently overwritten by a later service's generation. Shared by the
// campaign-brief API route and the Brain chat's campaign_brief/regenerate_ads
// actions so all three write to the same place the same way.
export async function generateAndSaveCampaignBrief(clientId: string, service: string) {
  const sb = createSupabaseClient();

  const { data: existing } = await sb
    .from("campaign_briefs")
    .select("google_doc_id, google_doc_url, ideal_customer, budget_targeting, service_details")
    .eq("client_id", clientId)
    .maybeSingle();

  const result = await generateCampaignBrief(clientId, service);

  const sharedAlreadySet = !!(existing?.ideal_customer && existing?.budget_targeting);
  const idealCustomer = sharedAlreadySet ? existing!.ideal_customer : result.idealCustomer;
  const budgetTargeting = sharedAlreadySet ? existing!.budget_targeting : result.budgetTargeting;

  // A link already used as creative-reference evidence for one of this
  // client's OTHER services can't also be evidence for this one — same
  // cross-service leakage bug class the old ad-concepts step was hardened
  // against (Lucky's shared client notes/research sometimes superficially
  // fit more than one service). Strip it here in code rather than trust the
  // model to self-police.
  const serviceDetails = { ...(existing?.service_details as Record<string, unknown> | null) };
  const linksUsedByOtherServices = new Set(
    Object.entries(serviceDetails)
      .filter(([svc]) => svc !== service)
      .flatMap(([, details]) => (details as { ads?: AdConcept[] })?.ads || [])
      .map((ad) => ad.creativeReference?.url)
      .filter((u): u is string => !!u)
  );
  result.plan.ads = result.plan.ads.map((ad) =>
    ad.creativeReference?.url && linksUsedByOtherServices.has(ad.creativeReference.url)
      ? { ...ad, creativeReference: { ...ad.creativeReference, url: null } }
      : ad
  );

  serviceDetails[service] = result.plan;

  // One persistent Google Doc per client — created the first time any
  // brief is generated, then appended to (never replaced) on every
  // regeneration so every service's plan accumulates in the same file
  // instead of scattering across separate docs per run.
  let googleDocId = existing?.google_doc_id || null;
  let googleDocUrl = existing?.google_doc_url || null;

  const docMarkdown = buildDocMarkdown(service, idealCustomer, budgetTargeting, result.plan, !sharedAlreadySet);
  if (!googleDocId) {
    // Cover tab only — real content always lands in its own per-service tab
    // (below) so the doc reads as one tab per service, not one long page.
    const created = await createDocWithId(`${result.clientName} — Campaign Master Doc`, `# ${result.clientName} — Campaign Master Doc`);
    googleDocId = created.docId;
    googleDocUrl = created.url;
    await appendMarkedTextToDocTab(googleDocId, service, docMarkdown);
  } else {
    const dateLabel = new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
    await appendMarkedTextToDocTab(googleDocId, service, `## Regenerated — ${dateLabel}\n${docMarkdown.replace(/^# .+\n\n/, "")}`);
  }

  const { data, error } = await sb
    .from("campaign_briefs")
    .upsert(
      {
        client_id: clientId,
        status: "draft",
        ideal_customer: idealCustomer,
        budget_targeting: budgetTargeting,
        service_details: serviceDetails,
        google_doc_id: googleDocId,
        google_doc_url: googleDocUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id" }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);

  await notifySlack(`Campaign setup ready for *${result.clientName}* — ${service} (${result.plan.ads.length} ad concepts).\n${result.plan.recommendedOffer}\nDoc: ${googleDocUrl}`);

  return data;
}
