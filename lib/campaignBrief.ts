import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "@/lib/supabase";
import { parseJsonResponse } from "@/lib/ai";
import { createDocWithId, appendMarkedTextToDocTab } from "@/lib/googleDocs";
import { notifySlack } from "@/lib/slack";

// Ideal customer + budget/targeting are shared across every service a
// client offers (same audience, same spend, regardless of which service tab
// you're looking at) — everything else is specific to one service and
// lives under campaign_briefs.service_details, keyed by service name.
export interface ServiceStrategy {
  offerPricing: string;
  jobValueMargins: string;
  competitorResearch: string;
  leadQualificationCriteria: string;
  retargetingStrategy: string;
}

export interface CampaignBriefResult {
  idealCustomer: string;
  budgetTargeting: string;
  service: string;
  serviceFields: ServiceStrategy;
  docMarkdown: string;
  clientName: string;
}

const SERVICE_FIELD_LABELS: Record<keyof ServiceStrategy, string> = {
  offerPricing: "Offer + Pricing Confirmed",
  jobValueMargins: "Job Value & Margins",
  competitorResearch: "Competitor Research",
  leadQualificationCriteria: "Lead Qualification Criteria",
  retargetingStrategy: "Retargeting Strategy",
};

const SYSTEM_PROMPT = `You write Stage 01 (STRATEGY) campaign briefs for Lucky from LS Growth, a lead generation agency that runs Meta ads for trade and home service businesses in NZ and Australia. This is the strategy step that happens before any ad gets built. LS Growth's own process only has 3 things to confirm at this stage:

1. Offer + pricing confirmed
2. Ideal customer defined
3. Budget + targeting set

A client can offer several distinct services (e.g. renovations, extensions, decks) run as separate campaigns — you're being asked to research ONE specific service this time, given below, while ideal customer and budget/targeting are shared across all of that client's services (write those considering the client's full service list, not just the one you're researching).

You'll be given a client's trade, service area(s), full service list, which one service to focus this brief on, and whatever business info is already on file. Use the web_search tool to research that specific service in that specific city/region before writing anything: who the visible competitors are and what they're doing, typical pricing/job value for that service locally, and what ad angles/offers are currently working for this niche on Meta. Do several searches with different phrasings before answering — don't stop after one search.

Write these fields:

SHARED (apply to the whole client, not just this one service) — each 1-2 sentences MAX, a plain decision statement, not a research writeup:
- idealCustomer: who actually buys from this client across their services and where — property type/situation that identifies them, and the real coverage area, in one line
- budgetTargeting: what to optimize for (leads/calls/bookings), a concrete starting daily/monthly budget, and the core targeting approach on Meta — one line each, combined

THIS SERVICE ONLY:
- offerPricing (1-2 sentences MAX, plain decision statement): the specific offer/price to lead with for this one service — a real number or range for this trade+region+service, not "competitive pricing"
- jobValueMargins (2-3 sentences): typical job value and margin for this specific service in this market
- competitorResearch (2-3 sentences): what you actually found — real competitors/ads if any doing this service, their angle, what gap exists
- leadQualificationCriteria (2-3 sentences): what separates a lead worth calling from one to filter out, for this service
- retargetingStrategy (2-3 sentences): what to retarget and with what, once this service's campaign has initial traffic

Respond with ONLY a JSON object as your final message, no markdown fences, no other text:
{"idealCustomer": "...", "budgetTargeting": "...", "offerPricing": "...", "jobValueMargins": "...", "competitorResearch": "...", "leadQualificationCriteria": "...", "retargetingStrategy": "..."}`;

function buildDocMarkdown(service: string, idealCustomer: string, budgetTargeting: string, fields: ServiceStrategy, includeShared: boolean): string {
  const shared = includeShared
    ? `## Ideal Customer Defined\n${idealCustomer || "—"}\n\n## Budget + Targeting Set\n${budgetTargeting || "—"}\n\n`
    : "";
  const serviceFields = (Object.keys(SERVICE_FIELD_LABELS) as (keyof ServiceStrategy)[])
    .map((key) => `## ${SERVICE_FIELD_LABELS[key]}\n${fields[key] || "—"}`)
    .join("\n\n");
  return `# Strategy — ${service}\n\n${shared}${serviceFields}`;
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
  };
  const services: string[] = config?.services || [];
  const serviceAreas: string[] = config?.service_areas || [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");
  const anthropic = new Anthropic({ apiKey });

  const userPrompt = `Client: ${client.name}
Trade: ${client.trade || "unknown — infer from the info below"}
Service area(s): ${serviceAreas.length ? serviceAreas.join(", ") : "not set — infer a reasonable NZ/AU region if the trade/name implies one, otherwise say so in idealCustomer"}
Full service list: ${services.length ? services.join(", ") : "none listed"}
Service to research and write this brief for: ${service}
Business description on file: ${businessInfo.description || "none"}
Proof point on file: ${businessInfo.proof_point || "none"}
Website: ${businessInfo.website_url || "none"}
Extra context: ${businessInfo.extra_context || "none"}

Research the "${service}" service in this market and write the Stage 01 STRATEGY brief.`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 } as const],
  });

  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<Partial<ServiceStrategy> & { idealCustomer?: string; budgetTargeting?: string }>(text);

  const serviceFields: ServiceStrategy = {
    offerPricing: parsed.offerPricing || "",
    jobValueMargins: parsed.jobValueMargins || "",
    competitorResearch: parsed.competitorResearch || "",
    leadQualificationCriteria: parsed.leadQualificationCriteria || "",
    retargetingStrategy: parsed.retargetingStrategy || "",
  };
  const idealCustomer = parsed.idealCustomer || "";
  const budgetTargeting = parsed.budgetTargeting || "";

  if (!serviceFields.offerPricing || !idealCustomer || !budgetTargeting) {
    throw new Error("AI response missing required brief fields");
  }

  return {
    idealCustomer,
    budgetTargeting,
    service,
    serviceFields,
    docMarkdown: buildDocMarkdown(service, idealCustomer, budgetTargeting, serviceFields, true),
    clientName: client.name,
  };
}

// Generates a fresh strategy for one service and merges it into the
// client's campaign_briefs row (status reset to "draft" — any prior
// approval doesn't carry over automatically since the content just
// changed). idealCustomer/budgetTargeting are shared across services — only
// written the first time (row doesn't exist yet or they're still empty),
// never silently overwritten by a later service's generation. Shared by the
// campaign-brief API route and the Brain chat's campaign_brief action so
// both write to the same place the same way.
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

  const serviceDetails = { ...(existing?.service_details as Record<string, unknown> | null) };
  serviceDetails[service] = result.serviceFields;

  // One persistent Google Doc per client — created the first time any
  // brief is generated, then appended to (never replaced) on every
  // regeneration so every service's strategy, ad copy, etc accumulates in
  // the same file instead of scattering across separate docs per run.
  let googleDocId = existing?.google_doc_id || null;
  let googleDocUrl = existing?.google_doc_url || null;

  const docMarkdown = buildDocMarkdown(service, idealCustomer, budgetTargeting, result.serviceFields, !sharedAlreadySet);
  if (!googleDocId) {
    // Cover tab only — real content always lands in its own per-service tab
    // (below) so the doc reads as one tab per service, not one long page.
    const created = await createDocWithId(`${result.clientName} — Campaign Master Doc`, `# ${result.clientName} — Campaign Master Doc`);
    googleDocId = created.docId;
    googleDocUrl = created.url;
    await appendMarkedTextToDocTab(googleDocId, service, docMarkdown);
  } else {
    const dateLabel = new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
    await appendMarkedTextToDocTab(googleDocId, service, `## Strategy Regenerated — ${dateLabel}\n${docMarkdown.replace(/^# .+\n\n/, "")}`);
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

  await notifySlack(`Campaign strategy ready for *${result.clientName}* — ${service}.\n${result.serviceFields.offerPricing}\nDoc: ${googleDocUrl}`);

  return data;
}
