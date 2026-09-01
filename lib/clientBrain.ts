import { createSupabaseClient } from "./supabase";

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
