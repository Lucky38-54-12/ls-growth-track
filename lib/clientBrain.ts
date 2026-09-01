import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "./supabase";
import { parseJsonResponse } from "./ai";
import { readGoogleDocAllTabsText, searchDriveDocs, readGoogleDocText } from "./googleDocs";

// Ground-truth business knowledge about a client — separate from the
// reasoning framework (the Creative Brain system prompt) and from
// performance memory (ad_learnings/creative_hypotheses). This is
// authoritative unless Lucky updates it — the model only ever reads it,
// never writes to it, since it's meant to be verified fact, not inference.
export interface ClientBrainBusiness {
  name?: string;
  trade?: string;
  locations?: string[];
  serviceAreas?: string[];
  yearsOperating?: string;
  capacity?: string;
  businessModel?: string;
  services?: string[];
  priorityServices?: string[];
}

export interface ClientBrainCustomer {
  idealCustomer?: string;
  situations?: string[];
  problems?: string[];
  desiredOutcomes?: string[];
  emotionalDrivers?: string[];
  buyingTriggers?: string[];
  objections?: string[];
  decisionFactors?: string[];
  urgency?: string;
  language?: string[];
}

export interface ClientBrainOffer {
  currentOffers?: string[];
  historicalOffers?: string[];
  pricing?: string;
  responseMechanisms?: string[];
  guarantees?: string[];
  discounts?: string[];
  bonuses?: string[];
  capacityConstraints?: string;
  seasonalConstraints?: string;
}

export interface ClientBrainProof {
  testimonials?: string[];
  reviews?: string;
  caseStudies?: string[];
  beforeAfterProjects?: string[];
  credentials?: string[];
  experience?: string;
  realResults?: string[];
  specificProjects?: string[];
  differentiators?: string[];
}

export interface ClientBrainMarket {
  characteristics?: string;
  competitorPositioning?: string;
  competitorMessaging?: string[];
  competitorOffers?: string[];
  overusedPatterns?: string[];
  gaps?: string[];
}

export interface ClientBrain {
  clientId: string;
  business: ClientBrainBusiness;
  customer: ClientBrainCustomer;
  offer: ClientBrainOffer;
  proof: ClientBrainProof;
  market: ClientBrainMarket;
  updatedAt: string;
}

export async function getClientBrain(sb: ReturnType<typeof createSupabaseClient>, clientId: string): Promise<ClientBrain | null> {
  const { data } = await sb.from("client_brain").select("*").eq("client_id", clientId).maybeSingle();
  if (!data) return null;
  return {
    clientId: data.client_id,
    business: data.business || {},
    customer: data.customer || {},
    offer: data.offer || {},
    proof: data.proof || {},
    market: data.market || {},
    updatedAt: data.updated_at,
  };
}

export async function upsertClientBrain(
  sb: ReturnType<typeof createSupabaseClient>,
  clientId: string,
  sections: Partial<Pick<ClientBrain, "business" | "customer" | "offer" | "proof" | "market">>
): Promise<void> {
  const { error } = await sb.from("client_brain").upsert(
    { client_id: clientId, ...sections, updated_at: new Date().toISOString() },
    { onConflict: "client_id" }
  );
  if (error) throw error;
}

// Flattens whatever sections exist into a readable block for the Brain's
// user prompt — empty/missing sections are just omitted rather than shown
// as empty scaffolding.
export function summarizeClientBrain(cb: ClientBrain | null): string {
  if (!cb) return "No Client Brain on file yet for this client — ground-truth business/customer/offer/proof/market details haven't been captured beyond what's in the campaign brief and Drive docs below.";
  const lines: string[] = [];
  const section = (label: string, obj: object) => {
    const entries = Object.entries(obj).filter(([, v]) => v && (!Array.isArray(v) || v.length > 0));
    if (!entries.length) return;
    lines.push(`${label}:`);
    for (const [k, v] of entries) {
      lines.push(`  - ${k}: ${Array.isArray(v) ? v.join("; ") : v}`);
    }
  };
  section("BUSINESS", cb.business);
  section("CUSTOMER", cb.customer);
  section("OFFER", cb.offer);
  section("PROOF", cb.proof);
  section("MARKET", cb.market);
  return lines.length ? lines.join("\n") : "Client Brain exists but every section is currently empty.";
}

const EXTRACT_SYSTEM_PROMPT = `You extract structured business facts from real documents Lucky (LS Growth) has already written about one of his clients — you are not researching or inventing anything, only reorganising what's actually written into a structured shape.

Only include a fact if it is explicitly stated or very directly implied in the text given. If a whole section (business/customer/offer/proof/market) has nothing relevant in the source text, return it as an empty object — never guess, never fill a gap with something plausible-sounding, never invent a testimonial, price, guarantee or claim that isn't actually in the text.

Respond with ONLY a JSON object, no markdown fences, no other text:
{
  "business": {"name": "..." or omit, "trade": "..." or omit, "locations": ["..."] or omit, "serviceAreas": ["..."] or omit, "yearsOperating": "..." or omit, "capacity": "..." or omit, "businessModel": "..." or omit, "services": ["..."] or omit, "priorityServices": ["..."] or omit},
  "customer": {"idealCustomer": "..." or omit, "situations": ["..."] or omit, "problems": ["..."] or omit, "desiredOutcomes": ["..."] or omit, "emotionalDrivers": ["..."] or omit, "buyingTriggers": ["..."] or omit, "objections": ["..."] or omit, "decisionFactors": ["..."] or omit, "urgency": "..." or omit, "language": ["..."] or omit},
  "offer": {"currentOffers": ["..."] or omit, "historicalOffers": ["..."] or omit, "pricing": "..." or omit, "responseMechanisms": ["..."] or omit, "guarantees": ["..."] or omit, "discounts": ["..."] or omit, "bonuses": ["..."] or omit, "capacityConstraints": "..." or omit, "seasonalConstraints": "..." or omit},
  "proof": {"testimonials": ["..."] or omit, "reviews": "..." or omit, "caseStudies": ["..."] or omit, "beforeAfterProjects": ["..."] or omit, "credentials": ["..."] or omit, "experience": "..." or omit, "realResults": ["..."] or omit, "specificProjects": ["..."] or omit, "differentiators": ["..."] or omit},
  "market": {"characteristics": "..." or omit, "competitorPositioning": "..." or omit, "competitorMessaging": ["..."] or omit, "competitorOffers": ["..."] or omit, "overusedPatterns": ["..."] or omit, "gaps": ["..."] or omit}
}`;

// Builds/refreshes a client's Client Brain by extracting structured facts
// out of documents Lucky has already written (the Campaign Master Doc —
// every tab — plus any other Drive docs matching "{client} strategy"),
// rather than researching or inventing anything new. This is pure
// reorganisation of his own existing content, so unlike a real strategic
// judgment call, it writes directly (upserts) rather than sitting behind
// chat_drafts approval — same reasoning as syncAdCreativesArchive.
export async function draftClientBrainFromDocs(
  sb: ReturnType<typeof createSupabaseClient>,
  clientId: string,
  clientName: string,
  googleDocId: string | null
): Promise<ClientBrain> {
  const sourceTexts: string[] = [];

  if (googleDocId) {
    try {
      sourceTexts.push(`=== Campaign Master Doc ===\n${await readGoogleDocAllTabsText(googleDocId, 4000)}`);
    } catch {
      // doc unreadable — continue with whatever else is found
    }
  }

  try {
    const matches = await searchDriveDocs(`${clientName} strategy`, 3);
    for (const m of matches) {
      if (m.id === googleDocId) continue; // already pulled in full above
      try {
        const text = await readGoogleDocText(m.id, 3000);
        if (text) sourceTexts.push(`=== ${m.name} ===\n${text}`);
      } catch {
        // skip unreadable doc
      }
    }
  } catch {
    // Drive search failed — continue with whatever's already collected
  }

  if (!sourceTexts.length) {
    throw new Error(`No readable docs found for ${clientName} — nothing to extract a Client Brain from yet.`);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");
  const anthropic = new Anthropic({ apiKey });

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [{ type: "text", text: EXTRACT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Client: ${clientName}\n\n${sourceTexts.join("\n\n")}` }],
  });

  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<{
    business?: ClientBrainBusiness;
    customer?: ClientBrainCustomer;
    offer?: ClientBrainOffer;
    proof?: ClientBrainProof;
    market?: ClientBrainMarket;
  }>(text);

  const sections = {
    business: parsed.business || {},
    customer: parsed.customer || {},
    offer: parsed.offer || {},
    proof: parsed.proof || {},
    market: parsed.market || {},
  };

  await upsertClientBrain(sb, clientId, sections);

  return { clientId, ...sections, updatedAt: new Date().toISOString() };
}
