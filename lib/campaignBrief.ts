import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "@/lib/supabase";
import { parseJsonResponse } from "@/lib/ai";
import { createDocWithId, appendMarkedTextToDoc } from "@/lib/googleDocs";
import { notifySlack } from "@/lib/slack";

export interface CampaignBriefFields {
  offerPricing: string;
  idealCustomer: string;
  budgetTargeting: string;
  jobValueMargins: string;
  competitorResearch: string;
  leadQualificationCriteria: string;
  retargetingStrategy: string;
}

export interface CampaignBriefResult extends CampaignBriefFields {
  docMarkdown: string;
  clientName: string;
}

const PRIMARY_FIELDS: (keyof CampaignBriefFields)[] = ["offerPricing", "idealCustomer", "budgetTargeting"];
const SUPPORTING_FIELDS: (keyof CampaignBriefFields)[] = [
  "jobValueMargins",
  "competitorResearch",
  "leadQualificationCriteria",
  "retargetingStrategy",
];

const SECTION_LABELS: Record<keyof CampaignBriefFields, string> = {
  offerPricing: "Offer + Pricing Confirmed",
  idealCustomer: "Ideal Customer Defined",
  budgetTargeting: "Budget + Targeting Set",
  jobValueMargins: "Job Value & Margins",
  competitorResearch: "Competitor Research",
  leadQualificationCriteria: "Lead Qualification Criteria",
  retargetingStrategy: "Retargeting Strategy",
};

const SYSTEM_PROMPT = `You write Stage 01 (STRATEGY) campaign briefs for Lucky from LS Growth, a lead generation agency that runs Meta ads for trade and home service businesses in NZ and Australia. This is the strategy step that happens before any ad gets built. LS Growth's own process only has 3 things to confirm at this stage — this brief exists to confirm exactly those 3, nothing more:

1. Offer + pricing confirmed
2. Ideal customer defined
3. Budget + targeting set

You'll be given a client's trade, service area(s), and whatever business info is already on file (description, proof points, existing services). Use the web_search tool to research that trade in that specific city/region before writing anything: who the visible competitors are and what they're doing, typical pricing/job value for that trade locally, and what ad angles/offers are currently working for this niche on Meta. Do several searches with different phrasings before answering — don't stop after one search.

Write these 7 fields:

PRIMARY — these are the actual deliverable. Each is 1-2 sentences MAX, a plain decision statement, not a research writeup. State the number or the choice directly — no throat-clearing, no "the market suggests," no restating the question back. If you found a real number, lead with it; don't hedge with a paragraph of justification underneath.
- offerPricing: the one service to build this campaign around, and the specific offer/price to lead with — a real number or range for this trade+region, not "competitive pricing"
- idealCustomer: who actually buys this and where — property type/situation that identifies them, and the real coverage area, in one line
- budgetTargeting: what to optimize for (leads/calls/bookings), a concrete starting daily/monthly budget, and the core targeting approach on Meta — one line each, combined

SUPPORTING — brief backing notes for the above, 2-3 sentences max each, still specific to this client/market (never generic filler that could apply to any trade):
- jobValueMargins: typical job value and margin for this service in this market
- competitorResearch: what you actually found — real competitors/ads if any, their angle, what gap exists
- leadQualificationCriteria: what separates a lead worth calling from one to filter out
- retargetingStrategy: what to retarget and with what, once the campaign has initial traffic

Respond with ONLY a JSON object as your final message, no markdown fences, no other text:
{"offerPricing": "...", "idealCustomer": "...", "budgetTargeting": "...", "jobValueMargins": "...", "competitorResearch": "...", "leadQualificationCriteria": "...", "retargetingStrategy": "..."}`;

function buildDocMarkdown(clientName: string, fields: CampaignBriefFields): string {
  const primary = PRIMARY_FIELDS.map((key) => `## ${SECTION_LABELS[key]}\n${fields[key] || "—"}`).join("\n\n");
  const supporting = SUPPORTING_FIELDS.map((key) => `## ${SECTION_LABELS[key]}\n${fields[key] || "—"}`).join("\n\n");
  return `# Campaign Brief — ${clientName}\n\n# Stage 01 — Strategy (Confirmed)\n\n${primary}\n\n# Supporting Research\n\n${supporting}`;
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
Service area(s): ${serviceAreas.length ? serviceAreas.join(", ") : "not set — infer a reasonable NZ/AU region if the trade/name implies one, otherwise say so in idealCustomer"}
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
    idealCustomer: parsed.idealCustomer || "",
    budgetTargeting: parsed.budgetTargeting || "",
    jobValueMargins: parsed.jobValueMargins || "",
    competitorResearch: parsed.competitorResearch || "",
    leadQualificationCriteria: parsed.leadQualificationCriteria || "",
    retargetingStrategy: parsed.retargetingStrategy || "",
  };

  if (!fields.offerPricing || !fields.idealCustomer || !fields.budgetTargeting) {
    throw new Error("AI response missing required brief fields");
  }

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
        ideal_customer: fields.idealCustomer,
        budget_targeting: fields.budgetTargeting,
        job_value_margins: fields.jobValueMargins,
        competitor_research: fields.competitorResearch,
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

  await notifySlack(`Campaign strategy brief ready for *${fields.clientName}*.\n${fields.offerPricing}\nDoc: ${googleDocUrl}`);

  return data;
}
