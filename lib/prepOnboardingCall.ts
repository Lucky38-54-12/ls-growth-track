import { createSupabaseClient } from "./supabase";
import { SalesCall, OnboardingClient } from "./types";
import { creativeAsksFor } from "./creativeAskExamples";
import { ONBOARDING_CALL_AGENDA } from "./onboardingCallAgenda";
import { TRADES } from "./tradeList";

// Keyword guesses for inferring a trade from free text when nothing on
// record states it outright (deal_terms/raw_summary wording, not a
// structured field) — same spirit as the cleaning-trade matching in
// lib/leads.ts, just a few more patterns since this covers every trade.
const TRADE_KEYWORDS: Record<(typeof TRADES)[number], RegExp> = {
  "Cleaning": /clean/i,
  "Builders": /build|construct|carpentry/i,
  "Plumbing": /plumb/i,
  "Electrical": /electric|sparky|solar/i,
  "Landscaping": /landscap|garden/i,
  "Painting": /paint/i,
  "Roofing": /roof/i,
  "Removals": /removal|moving company/i,
  "Pest Control": /pest/i,
  "Renovations": /renovat|\breno\b/i,
  "Floor Coatings": /floor coat|epoxy floor/i,
  "Fencing": /fenc/i,
};

function guessTrade(text: string): string {
  for (const trade of TRADES) {
    if (TRADE_KEYWORDS[trade].test(text)) return trade;
  }
  return "";
}

export interface OnboardingPrepResult {
  company: string;
  trade: string;
  hasOnboardingRecord: boolean;
  markedText: string;
}

// Pulls together everything already on file for a client from their sales
// call (deal terms, objections, what Lucky said he'd follow up on) plus the
// standard onboarding call agenda and trade-specific creative-ask list, into
// one doc ready to run the onboarding call off — instead of Lucky having to
// go dig the old sales call notes back up himself. Matches by company name
// (onboarding_clients first, since that's the real post-close record; sales
//_calls as a fallback for a deal that hasn't actually been logged as closed
// yet, so this can still be useful before that point).
export async function prepOnboardingCall(
  sb: ReturnType<typeof createSupabaseClient>,
  clientQuery: string
): Promise<OnboardingPrepResult> {
  const query = clientQuery.trim();
  if (!query) throw new Error("No client name given to prep an onboarding call for.");

  const { data: onboardingClient } = await sb
    .from("onboarding_clients")
    .select("*")
    .ilike("company", `%${query}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<OnboardingClient>();

  let salesCall: SalesCall | null = null;
  if (onboardingClient?.sales_call_id) {
    const { data } = await sb.from("sales_calls").select("*").eq("id", onboardingClient.sales_call_id).maybeSingle();
    salesCall = data;
  } else {
    const { data } = await sb
      .from("sales_calls")
      .select("*")
      .or(`business_name.ilike.%${query}%,prospect_name.ilike.%${query}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    salesCall = data;
  }

  if (!onboardingClient && !salesCall) {
    throw new Error(`Couldn't find an onboarding client or sales call matching "${clientQuery}".`);
  }

  const company = onboardingClient?.company || salesCall?.business_name || clientQuery;
  const contactName = onboardingClient?.name || salesCall?.prospect_name || "";

  const trade =
    onboardingClient?.trade ||
    guessTrade(`${company} ${onboardingClient?.notes || ""} ${salesCall?.deal_terms || ""} ${salesCall?.raw_summary || ""}`);

  const dealRecap = onboardingClient?.notes || salesCall?.deal_terms || salesCall?.next_step_detail || "No deal terms on file — check with Lucky before running this call.";

  const watchFor = [
    salesCall?.main_objection ? `Main objection on the sales call: ${salesCall.main_objection}` : "",
    salesCall?.work_ons ? `What Lucky flagged to tighten up: ${salesCall.work_ons}` : "",
  ].filter(Boolean);

  const asks = creativeAsksFor(trade);

  const lines: string[] = [];
  lines.push(`# Onboarding Call Prep — ${company}`);
  lines.push("");
  lines.push("## Deal recap (from the sales call)");
  lines.push(dealRecap);
  if (contactName) lines.push(`Contact: ${contactName}`);
  lines.push("");

  if (watchFor.length) {
    lines.push("## From the sales call — worth remembering");
    for (const w of watchFor) lines.push(`• ${w}`);
    lines.push("");
  }

  lines.push(`## Creatives to ask for${trade ? ` — ${trade}` : ""}`);
  for (const a of asks) lines.push(`• ${a}`);
  lines.push("");

  for (const section of ONBOARDING_CALL_AGENDA) {
    lines.push(`## ${section.heading}`);
    lines.push(section.body);
    lines.push("");
  }

  if (!onboardingClient) {
    lines.push("## Note");
    lines.push("No onboarding_clients record exists yet for this business — this was built straight off the sales call. Once the deal's logged as closed (log_call with the agreed terms), the real onboarding record gets created automatically and this same info will show on its onboarding call card.");
  }

  // Backfill the trade onto the real record if it's missing one, so the
  // live OnboardingCallCard on /dashboard/onboarding already has it set
  // when Lucky actually runs the call, instead of him re-picking it there.
  if (onboardingClient && !onboardingClient.trade && trade) {
    await sb.from("onboarding_clients").update({ trade }).eq("id", onboardingClient.id);
  }

  return {
    company,
    trade,
    hasOnboardingRecord: Boolean(onboardingClient),
    markedText: lines.join("\n"),
  };
}
