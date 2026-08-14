import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "@/lib/supabase";
import { parseJsonResponse } from "@/lib/ai";
import { createDocWithId, appendMarkedTextToDoc } from "@/lib/googleDocs";
import { notifySlack } from "@/lib/slack";

export interface CampaignBriefFields {
  offerPricing: string;
  mainService: string;
  idealCustomer: string;
  serviceArea: string;
  jobValueMargins: string;
  competitorResearch: string;
  objective: string;
  budget: string;
  targetingApproach: string;
  leadQualificationCriteria: string;
  retargetingStrategy: string;
}

export interface CampaignBriefResult extends CampaignBriefFields {
  docMarkdown: string;
  clientName: string;
}

const SECTION_LABELS: Record<keyof CampaignBriefFields, string> = {
  offerPricing: "Offer & Pricing",
  mainService: "Main Service",
  idealCustomer: "Ideal Customer",
  serviceArea: "Service Area",
  jobValueMargins: "Job Value & Margins",
  competitorResearch: "Competitor Research",
  objective: "Campaign Objective",
  budget: "Budget",
  targetingApproach: "Targeting Approach",
  leadQualificationCriteria: "Lead Qualification Criteria",
  retargetingStrategy: "Retargeting Strategy",
};

const SYSTEM_PROMPT = `You write Stage 01 (STRATEGY) campaign briefs for Lucky from LS Growth, a lead generation agency that runs Meta ads for trade and home service businesses in NZ and Australia. This is the strategy step that happens before any ad gets built — the output other people at the agency will read to know what they're selling, to whom, and how, before touching Ads Manager.

You'll be given a client's trade, service area(s), and whatever business info is already on file (description, proof points, existing services). Use the web_search tool to research that trade in that specific city/region before writing anything: who the visible competitors are and what they're doing, typical pricing/job value for that trade locally, and what ad angles/offers are currently working for this niche on Meta. Do several searches with different phrasings before answering — don't stop after one search.

Write these 11 fields, each 1-4 sentences, grounded in the client's actual business info and what you found — never generic filler that could apply to any trade:
- offerPricing: the specific offer and price point to lead with (a real number/range where you can find or reasonably infer one for this trade+region, not "competitive pricing")
- mainService: the single service to build this campaign around (pick one even if the client offers several — the one with the best margin/demand combination based on your research)
- idealCustomer: who actually buys this, specifically (property type, budget signal, situation) — not "homeowners"
- serviceArea: the real coverage area, informed by the client's service_areas
- jobValueMargins: typical job value and margin for this service in this market, from your research
- competitorResearch: 2-4 sentences naming what you actually found — real competitors/ads if you found them, their angle, what gap exists
- objective: what this specific campaign should optimize for (leads, calls, bookings) and why, given the trade
- budget: a concrete starting daily/monthly budget recommendation with reasoning tied to the job value above
- targetingApproach: audience/targeting approach on Meta for this niche and area
- leadQualificationCriteria: what separates a lead worth calling from one to filter out, specific to this trade
- retargetingStrategy: what to retarget and with what, once the campaign has initial traffic

Respond with ONLY a JSON object as your final message, no markdown fences, no other text:
{"offerPricing": "...", "mainService": "...", "idealCustomer": "...", "serviceArea": "...", "jobValueMargins": "...", "competitorResearch": "...", "objective": "...", "budget": "...", "targetingApproach": "...", "leadQualificationCriteria": "...", "retargetingStrategy": "..."}`;

function buildDocMarkdown(clientName: string, fields: CampaignBriefFields): string {
  const sections = (Object.keys(SECTION_LABELS) as (keyof CampaignBriefFields)[])
    .map((key) => `## ${SECTION_LABELS[key]}\n${fields[key] || "—"}`)
    .join("\n\n");
  return `# Campaign Brief — ${clientName}\n\n${sections}`;
}

export async function generateCampaignBrief(clientId: string): Promise<CampaignBriefResult> {
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
Service area(s): ${serviceAreas.length ? serviceAreas.join(", ") : "not set — infer a reasonable NZ/AU region if the trade/name implies one, otherwise say so in serviceArea"}
Existing services on file: ${services.length ? services.join(", ") : "none listed"}
Business description on file: ${businessInfo.description || "none"}
Proof point on file: ${businessInfo.proof_point || "none"}
Website: ${businessInfo.website_url || "none"}
Extra context: ${businessInfo.extra_context || "none"}

Research this market and write the Stage 01 STRATEGY brief.`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 } as const],
  });

  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<Partial<CampaignBriefFields>>(text);

  const fields: CampaignBriefFields = {
    offerPricing: parsed.offerPricing || "",
    mainService: parsed.mainService || "",
    idealCustomer: parsed.idealCustomer || "",
    serviceArea: parsed.serviceArea || "",
    jobValueMargins: parsed.jobValueMargins || "",
    competitorResearch: parsed.competitorResearch || "",
    objective: parsed.objective || "",
    budget: parsed.budget || "",
    targetingApproach: parsed.targetingApproach || "",
    leadQualificationCriteria: parsed.leadQualificationCriteria || "",
    retargetingStrategy: parsed.retargetingStrategy || "",
  };

  if (!fields.mainService || !fields.objective) throw new Error("AI response missing required brief fields");

  return { ...fields, docMarkdown: buildDocMarkdown(client.name, fields), clientName: client.name };
}

// Generates a fresh brief and upserts it (status reset to "draft" — any
// prior approval doesn't carry over automatically since the content just
// changed). Shared by the campaign-brief API route and the Brain chat's
// campaign_brief action so both write to the same place the same way.
export async function generateAndSaveCampaignBrief(clientId: string) {
  const fields = await generateCampaignBrief(clientId);
  const sb = createSupabaseClient();

  // One persistent Google Doc per client — created the first time a brief
  // is generated, then appended to (never replaced) on every regeneration
  // so later stages (ad copy, landing page notes, etc) can build into the
  // same file instead of scattering across separate docs per run.
  const { data: existing } = await sb
    .from("campaign_briefs")
    .select("google_doc_id, google_doc_url")
    .eq("client_id", clientId)
    .maybeSingle();

  let googleDocId = existing?.google_doc_id || null;
  let googleDocUrl = existing?.google_doc_url || null;

  if (!googleDocId) {
    const created = await createDocWithId(`${fields.clientName} — Campaign Master Doc`, fields.docMarkdown);
    googleDocId = created.docId;
    googleDocUrl = created.url;
  } else {
    const dateLabel = new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
    await appendMarkedTextToDoc(googleDocId, `## Strategy Brief Regenerated — ${dateLabel}\n${fields.docMarkdown.replace(/^# .+\n\n/, "")}`);
  }

  const { data, error } = await sb
    .from("campaign_briefs")
    .upsert(
      {
        client_id: clientId,
        status: "draft",
        offer_pricing: fields.offerPricing,
        main_service: fields.mainService,
        ideal_customer: fields.idealCustomer,
        service_area: fields.serviceArea,
        job_value_margins: fields.jobValueMargins,
        competitor_research: fields.competitorResearch,
        objective: fields.objective,
        budget: fields.budget,
        targeting_approach: fields.targetingApproach,
        lead_qualification_criteria: fields.leadQualificationCriteria,
        retargeting_strategy: fields.retargetingStrategy,
        doc_markdown: fields.docMarkdown,
        google_doc_id: googleDocId,
        google_doc_url: googleDocUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id" }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);

  await notifySlack(`Campaign strategy brief ready for *${fields.clientName}*.\nObjective: ${fields.objective}\nDoc: ${googleDocUrl}`);

  return data;
}
