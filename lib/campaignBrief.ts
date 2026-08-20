import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "@/lib/supabase";
import { parseJsonResponse } from "@/lib/ai";
import { createDocWithId, appendMarkedTextToDocTab, replaceMarkedTextInDoc, replaceMarkedTextInDocTab, appendBoxedBlock } from "@/lib/googleDocs";
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
  headline: string; // the actual Meta headline text, ready to paste in — short and punchy
  primaryText: string; // the actual Meta primary text/body copy, ready to paste in
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
  serviceAreas: string[];
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

For each ad write: name (short concept label), format, angle, headline (the ACTUAL Meta ad headline text — short, punchy, ready to paste into Ads Manager, not a description of what the headline should do), primaryText (the ACTUAL Meta primary text/body copy a lead would read — 2-4 sentences, direct-response style, grounded in the real offer, ready to paste in, not a summary), hook (the opening line/moment — for video this is what's said or shown first, for static/carousel this is usually the same as or feeds directly into the headline), first3Seconds (what the viewer sees/hears immediately — for video/Reels; for a static image describe the first visual impression instead), creativeConcept (the visual structure — specific enough to shoot from), mainMessage (the underlying message/promise this ad is built around, one line), offer (which specific offer this ad tests — vary offers across the set where it makes sense, don't put the same offer on every ad by default), cta, copyFramework (choose PAS / AIDA / BAB / Proof→Outcome→Offer / Hook→Problem→Solution→Proof→CTA / or another framework — whatever fits this concept, don't force the same one on every ad), hypothesis (a specific, falsifiable claim — e.g. "A visual transformation combined with an emotional hook will attract higher-intent homeowners than generic service messaging," never just "video ad about X"), whyTesting (why this hypothesis is worth testing for this client/service specifically), and creativeReference when you have a REAL example backing the concept (source, url — null if you're describing a pattern rather than one specific ad you found, whatTheyreDoing, whatWeCanTake — the adapted principle, not a copy instruction).

Also write the SHARED fields (apply to the whole client, not just this service — write these considering the client's full service list): idealCustomer (who buys across their services and where, one line) and budgetTargeting (what to optimize for, a concrete starting budget, core targeting approach, one line each combined).

Finally, flags: a list of short strings for anything important you couldn't confirm and are NOT willing to guess (e.g. "No confirmed offer on file — used direct enquiry as the CTA," "Service area not set — assumed [region] from client name/trade, confirm this"). Empty array if nothing to flag.

Respond with ONLY a JSON object as your final message, no markdown fences, no other text:
{"idealCustomer": "...", "budgetTargeting": "...", "customer": "...", "customerProblem": "...", "desiredOutcome": "...", "keyObjections": "...", "recommendedOffer": "...", "marketResearch": {"keyFindings": "...", "commonOffers": "...", "commonMessaging": "...", "creativePatterns": "...", "opportunities": "..."}, "ads": [{"name": "...", "format": "...", "angle": "...", "headline": "...", "primaryText": "...", "hook": "...", "first3Seconds": "...", "creativeConcept": "...", "mainMessage": "...", "offer": "...", "cta": "...", "copyFramework": "...", "hypothesis": "...", "whyTesting": "...", "creativeReference": {"source": "...", "url": "..." or null, "whatTheyreDoing": "...", "whatWeCanTake": "..."} or null}], "flags": ["..."]}`;

function isPlausibleUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

// Plain (non-boxed) header: just the title + the two shared fields — short
// enough to not need a box of its own. Everything else (strategy, market
// research, flags, each ad) lands in its own bordered box afterwards (see
// appendServicePlanToDoc below) so the tab reads as a stack of clean cards,
// not one long wall of text.
function buildServiceHeaderMarkdown(service: string, idealCustomer: string, budgetTargeting: string, includeShared: boolean): string {
  const shared = includeShared
    ? `## Ideal Customer\n${idealCustomer || "—"}\n\n## Budget + Targeting\n${budgetTargeting || "—"}`
    : "";
  return `# Campaign Setup — ${service}\n\n${shared}`;
}

function strategyBoxLines(plan: ServiceCreativePlan): string[] {
  return [
    `Customer: ${plan.customer || "—"}`,
    "",
    `Customer problem: ${plan.customerProblem || "—"}`,
    "",
    `Desired outcome: ${plan.desiredOutcome || "—"}`,
    "",
    `Key objections: ${plan.keyObjections || "—"}`,
    "",
    `Recommended offer: ${plan.recommendedOffer || "—"}`,
  ];
}

function marketResearchBoxLines(mr: MarketResearch): string[] {
  return [
    `Key findings: ${mr.keyFindings || "—"}`,
    `Common offers: ${mr.commonOffers || "—"}`,
    `Common messaging: ${mr.commonMessaging || "—"}`,
    `Creative patterns: ${mr.creativePatterns || "—"}`,
    `Opportunities: ${mr.opportunities || "—"}`,
  ];
}

function adBoxLines(ad: AdConcept): string[] {
  const lines = [
    `Format: ${ad.format}`,
    `Angle: ${ad.angle}`,
    "",
    // The actual ready-to-paste ad unit — headline, body copy and CTA
    // grouped together in the order they'd be entered into Meta Ads
    // Manager, not scattered through the strategy breakdown below.
    `Headline: ${ad.headline}`,
    `Primary text: ${ad.primaryText}`,
    `CTA: ${ad.cta}`,
    "",
    `Offer: ${ad.offer}`,
    `Hook: ${ad.hook}`,
    `First 3 seconds: ${ad.first3Seconds}`,
    `Creative concept: ${ad.creativeConcept}`,
    `Main message: ${ad.mainMessage}`,
    `Copy framework: ${ad.copyFramework}`,
    `Hypothesis: ${ad.hypothesis}`,
    `Why we're testing it: ${ad.whyTesting}`,
  ];
  if (ad.creativeReference) {
    lines.push(
      "",
      `Creative reference: ${ad.creativeReference.source}${ad.creativeReference.url ? ` — ${ad.creativeReference.url}` : ""}`,
      `What they're doing: ${ad.creativeReference.whatTheyreDoing}`,
      `What we can take: ${ad.creativeReference.whatWeCanTake}`
    );
  }
  return lines;
}

// Writes one service's full plan into its doc tab as a stack of clean,
// bordered cards: a short plain-text title/shared-fields line, then one box
// each for Service Strategy, Market Research, any Flags, and every ad
// concept — real visual separation instead of one long scroll of text.
async function appendServicePlanToDoc(googleDocId: string, service: string, headerMarkdown: string, plan: ServiceCreativePlan): Promise<void> {
  await appendMarkedTextToDocTab(googleDocId, service, headerMarkdown);
  await appendBoxedBlock(googleDocId, service, "Service Strategy", strategyBoxLines(plan));
  await appendBoxedBlock(googleDocId, service, "Market Research", marketResearchBoxLines(plan.marketResearch));
  if (plan.flags.length) {
    await appendBoxedBlock(googleDocId, service, "Flagged — Missing Info", plan.flags);
  }
  for (const [i, ad] of plan.ads.entries()) {
    await appendBoxedBlock(googleDocId, service, `Ad ${i + 1} — ${ad.name}`, adBoxLines(ad));
  }
}

// Cover-tab content — always rebuilt (replaced, not appended) so it reflects
// the client's CURRENT shared fields no matter which service last
// regenerated. Kept deliberately short: a landing page for the doc, real
// detail lives in each service's own tab.
function buildOverviewMarkdown(clientName: string, serviceAreas: string[], idealCustomer: string, budgetTargeting: string): string {
  return `# ${clientName} — Campaign Master Doc\n\n## Campaign Overview\nClient: ${clientName}\nService area: ${serviceAreas.length ? serviceAreas.join(", ") : "—"}\nIdeal customer: ${idealCustomer || "—"}\nBudget + targeting: ${budgetTargeting || "—"}\n\nEach service has its own tab with the full creative testing plan (strategy, market research, ad concepts with ready-to-use headline/primary text). The "Testing Summary" tab lists every ad across every service at a glance.`;
}

function testingSummaryBoxLines(plan: ServiceCreativePlan): string[] {
  return plan.ads.flatMap((ad, i) => [
    `Ad ${i + 1} — ${ad.format || "—"} — ${ad.angle || "—"}`,
    `  Headline: ${ad.headline || "—"}`,
    `  Offer: ${ad.offer || "—"}`,
    `  Hypothesis: ${ad.hypothesis || "—"}`,
    ...(i < plan.ads.length - 1 ? [""] : []),
  ]);
}

// Rebuilds the whole Testing Summary tab from scratch — one bordered box
// per service, each listing every ad at a glance — the same "hand this to
// a media buyer" view as the campaign-setup UI's Testing Summary tab,
// mirrored into the doc. Always rebuilt fresh from whatever's currently
// saved across ALL services, not just the one that just regenerated.
async function rebuildTestingSummaryTab(googleDocId: string, clientName: string, serviceDetails: Record<string, ServiceCreativePlan>): Promise<void> {
  const services = Object.entries(serviceDetails).filter(([, plan]) => Array.isArray(plan?.ads) && plan.ads.length > 0);
  await replaceMarkedTextInDocTab(googleDocId, "Testing Summary", `# Testing Summary — ${clientName}${services.length === 0 ? "\n\nNo ad concepts generated yet." : ""}`);
  for (const [service, plan] of services) {
    await appendBoxedBlock(googleDocId, "Testing Summary", service, testingSummaryBoxLines(plan));
  }
}

// Same client/service-area lookup generateCampaignBrief does, but for a
// plan that was written WITHOUT calling Anthropic at all — e.g. hand-
// authored directly in a Claude Code session when the app's own API
// credits are the blocker, not the actual research/writing work. Still
// goes through the identical validation + save/doc pipeline as a normal
// generation (see saveCampaignBrief) so there's no separate, less-trusted
// code path for manually-provided content.
export async function buildManualCampaignBriefResult(clientId: string, service: string, plan: ServiceCreativePlan, idealCustomer: string, budgetTargeting: string): Promise<CampaignBriefResult> {
  const sb = createSupabaseClient();

  const { data: client, error: clientError } = await sb
    .from("lq_clients")
    .select("id, name, trade")
    .eq("id", clientId)
    .maybeSingle();
  if (clientError || !client) throw new Error(`Unknown client_id "${clientId}"`);

  const { data: configs } = await sb
    .from("lq_client_configs")
    .select("service_areas, status, version")
    .eq("client_id", clientId)
    .order("version", { ascending: false });
  const config = (configs || []).find((c) => c.status === "published") || (configs || [])[0] || null;
  const serviceAreas: string[] = config?.service_areas || [];

  if (!idealCustomer || !budgetTargeting || !plan.customer || plan.ads.length < 2 || plan.ads.some((a) => !a.name || !a.headline || !a.primaryText)) {
    throw new Error("Manual plan missing required campaign setup fields");
  }

  return {
    idealCustomer,
    budgetTargeting,
    service,
    plan,
    docMarkdown: buildServiceHeaderMarkdown(service, idealCustomer, budgetTargeting, true),
    clientName: client.name,
    serviceAreas,
  };
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
      headline: a.headline || "",
      primaryText: a.primaryText || "",
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

  if (!idealCustomer || !budgetTargeting || !plan.customer || ads.length < 2 || ads.some((a) => !a.name || !a.headline || !a.primaryText)) {
    throw new Error("AI response missing required campaign setup fields");
  }

  return {
    idealCustomer,
    budgetTargeting,
    service,
    plan,
    docMarkdown: buildServiceHeaderMarkdown(service, idealCustomer, budgetTargeting, true),
    clientName: client.name,
    serviceAreas,
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
export async function generateAndSaveCampaignBrief(clientId: string, service: string, opts?: { forceNewDoc?: boolean }) {
  const result = await generateCampaignBrief(clientId, service);
  return saveCampaignBrief(clientId, service, result, opts);
}

// Does everything AFTER the AI call: merges the plan into the client's
// campaign_briefs row, writes the doc (boxed layout, overview + testing
// summary refresh), saves. Split out from generateAndSaveCampaignBrief so a
// plan that was written WITHOUT calling the app's own Anthropic key (e.g.
// hand-authored directly, when API credits are the constraint rather than
// the work itself) can still go through the exact same save/doc pipeline —
// see app/api/campaign-brief/generate/route.ts's manualPlan bypass.
export async function saveCampaignBrief(clientId: string, service: string, result: CampaignBriefResult, opts?: { forceNewDoc?: boolean }) {
  const sb = createSupabaseClient();

  const { data: existing } = await sb
    .from("campaign_briefs")
    .select("google_doc_id, google_doc_url, ideal_customer, budget_targeting, service_details")
    .eq("client_id", clientId)
    .maybeSingle();

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
  // instead of scattering across separate docs per run. forceNewDoc (used
  // when Lucky explicitly wants a clean doc instead of one with old
  // pre-rebuild content still sitting in it) skips reusing the existing id.
  let googleDocId = opts?.forceNewDoc ? null : existing?.google_doc_id || null;
  let googleDocUrl = opts?.forceNewDoc ? null : existing?.google_doc_url || null;

  const headerMarkdown = buildServiceHeaderMarkdown(service, idealCustomer, budgetTargeting, !sharedAlreadySet);
  if (!googleDocId) {
    // Cover tab gets real Campaign Overview content (see buildOverviewMarkdown
    // below) rather than just a title — real per-service detail still lives
    // in each service's own tab, this is just the landing page.
    const created = await createDocWithId(`${result.clientName} — Campaign Master Doc`, `# ${result.clientName} — Campaign Master Doc`);
    googleDocId = created.docId;
    googleDocUrl = created.url;
    await appendServicePlanToDoc(googleDocId, service, headerMarkdown, result.plan);
  } else {
    const dateLabel = new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
    await appendServicePlanToDoc(googleDocId, service, `## Regenerated — ${dateLabel}\n${headerMarkdown.replace(/^# .+\n\n/, "")}`, result.plan);
  }

  // Overview (cover tab) and Testing Summary tab always get REPLACED with
  // the latest state across every service — unlike the per-service tabs,
  // these two should never show stale/duplicated history.
  await replaceMarkedTextInDoc(googleDocId, buildOverviewMarkdown(result.clientName, result.serviceAreas, idealCustomer, budgetTargeting));
  await rebuildTestingSummaryTab(googleDocId, result.clientName, serviceDetails as Record<string, ServiceCreativePlan>);

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
