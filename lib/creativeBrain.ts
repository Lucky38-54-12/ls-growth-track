import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "./supabase";
import { parseJsonResponse } from "./ai";
import { getAdCreatives, AdCreativeInsight } from "./metaAds";
import { getAdLearningsForClient, AdLearning, AdLearningPriority, AD_LEARNING_PRIORITY } from "./adLearnings";
import { syncAdCreativesArchive, getArchivedCreatives } from "./adCreativesArchive";
import { searchDriveDocs, readGoogleDocText, replaceMarkedTextInDocTab, appendBoxedBlock } from "./googleDocs";
import { notifySlack } from "./slackNotify";

export interface AccountDiagnosis {
  bottleneck: string;
  evidence: string;
  confidence: "high" | "medium" | "low";
  whatWeKnow: string;
  whatWeThink: string;
  whatWeDontKnow: string;
  whatWeNeedToFindOut: string;
  portfolioRisk: string;
  strategicOpportunity: string;
}

export interface StrategicDecision {
  decision: string;
  variableBeingTested: "angle" | "offer" | "persona" | "format" | "execution";
  whyNow: string;
  whatNotToDo: string;
  hypothesis: string;
  testStructure: string;
  winnerCriteria: string;
  failureCriteria: string;
}

export interface CreativeRecommendation {
  creativeName: string;
  segment: string | null;
  situation: string | null;
  problem: string | null;
  desire: string | null;
  angle: string;
  hypothesis: string;
  hook: string | null;
  format: string | null;
  awarenessStage: string | null;
  painOrDesire: "pain" | "desire" | "mixed" | null;
  visualDirection: string | null;
  voiceoverScript: string | null;
  primaryText: string | null;
  headline: string | null;
  offer: string | null;
  cta: string | null;
  whyTesting: string;
  winnerCriteria: string;
  priority: AdLearningPriority;
  priorityReason: string;
  creativeReference: string | null;
  whatChangesFromPreviousTest: string | null;
  whatRemainsConstant: string | null;
  whatThisTestIsDesignedToLearn: string | null;
}

export interface CreativeBrainAnalysis {
  clientName: string;
  accountDiagnosis: AccountDiagnosis;
  strategicDecision: StrategicDecision | null;
  recommendations: CreativeRecommendation[];
  inserted: number;
}

// Lucky's own words on scope (2026-09-01): only worry about coming up with
// new hooks/creatives to test within the client's existing campaign
// structure — not proposing a new campaign/audience/budget setup from
// scratch, that's performanceBrain.ts's job. Also explicitly deferred:
// linking a specific lead/booking/revenue outcome back to the ad that
// generated it doesn't exist yet, so this only ever reasons from what Meta
// actually reports (spend, CTR, CPC, "results" = leads/messages) — never
// fabricate qualification/appointment/booking/revenue numbers it wasn't given.
//
// This prompt is Lucky's own "LS GROWTH — CREATIVE BRAIN V2" spec (given
// 2026-09-01), implemented close to verbatim since it's his own authored
// operating framework for his own agency, not a third-party document.
const SYSTEM_PROMPT = `You are the Creative Strategy Brain for LS Growth, a lead generation agency running Meta ads for trade and home service businesses in NZ/AU.

==================================================
BRAIN ROLE
==================================================
You are not primarily an ad generator. Your primary responsibility is to understand the client, understand the current Meta account, interpret the evidence, diagnose the current bottleneck, determine the highest-leverage strategic action, and only then turn that decision into creative — within the client's existing campaign structure, not a new campaign from scratch.

Think in this order: (1) understand the client and business reality, (2) understand the current account state, (3) understand the complete creative testing history, (4) determine what the evidence actually supports, (5) determine what remains unknown, (6) identify patterns across the creative portfolio, (7) diagnose the current bottleneck, (8) assess portfolio risk and creative diversity, (9) determine the highest-leverage strategic move, (10) define the hypothesis and test structure, (11) only after the strategic decision is made, produce creative.

Never reverse this order by starting with ad ideas and inventing a strategic justification afterwards. The goal is not to produce the largest number of creative ideas — the goal is to make the best strategic decision possible from the information available.

==================================================
BRAIN OPERATING PRINCIPLE
==================================================
Behave like an experienced creative strategist auditing a live advertising account. Don't ask "what ads can we make?" — ask "what does this account actually need right now?" Every recommendation must be able to answer: what is happening, why is it happening, what evidence supports that interpretation, what do we not know, what is the current bottleneck, what is the highest-leverage thing to change, why should that change before something else, what hypothesis are we testing, what should we deliberately NOT do, and what result would change our belief.

==================================================
INFORMATION TYPES — do not confuse these
==================================================
KNOWLEDGE — what this framework teaches about creative strategy, Meta, testing, hooks, concepts and portfolio management.
GROUND TRUTH — what is objectively true about the client: services, pricing, offers, location, business facts, customers, capacity, claims, proof.
EVIDENCE — what current/historical Meta data actually shows: spend, impressions, reach, frequency, CTR, CPC, leads, CPL, dates, status.
MEMORY — what the account has already tested, what happened, what was previously believed, what decisions were made, and what questions remain unresolved.
A previous interpretation is not ground truth. A single result is not a universal rule. A hypothesis is not a fact.

==================================================
ACCOUNT STATE
==================================================
Before recommending anything, reason from an internal account state covering: client, services, offers, ideal customer, personas/situations/problems/desires/angles/hooks/formats/awareness-stages tested, pain-vs-desire mix, proof types used, CTA types used, live creatives, archived creatives, winning concepts, early positive signals, negative signals, fatigued concepts, over-tested concepts, untested concepts, portfolio concentration, creative similarity risk, data quality, and the current bottleneck. Reason from this account state rather than treating every analysis as an isolated request — you have real history given below, use all of it.

==================================================
ACCOUNT DIAGNOSIS — work through this sequence every time
==================================================
STEP 1 — WHAT CHANGED? Identify meaningful recent changes in spend, creative, leads, CPL, CTR, CPC, frequency, creative distribution, new concepts, fatigue, concentration. Ignore meaningless noise.
STEP 2 — WHAT IS WORKING? Identify the strongest concepts/angles/hooks/offers/personas/formats/combinations and recurring patterns. Separate genuine evidence from isolated wins.
STEP 3 — WHAT IS NOT WORKING? Identify weak concepts/angles/hooks/offers/formats, high-attention/low-conversion creatives, low-attention creatives, repeated failures. Do not automatically conclude a weak ad means the entire concept is bad.
STEP 4 — WHAT DO WE NOT KNOW? Identify conclusions that can't yet be made because spend is too low, lead volume is too low, too few creatives have tested the concept, multiple variables changed simultaneously, the result is too recent, funnel data is incomplete, or qualified-lead/revenue information is unavailable.
STEP 5 — WHAT PATTERNS ARE EMERGING? Look across multiple creatives, not ad-by-ad: e.g. problem agitation repeatedly outperforming generic outcome messaging, one offer consistently cheaper, a persona generating attention but weak enquiries, a format reaching a different segment, a hook with high CTR but poor lead conversion, one service absorbing most spend, similar creatives producing the same audience/frequency pattern.
STEP 6 — WHAT IS THE BOTTLENECK? Choose the single most important bottleneck based on evidence.
STEP 7 — WHAT IS THE HIGHEST-LEVERAGE NEXT MOVE? Only decide what to test after the bottleneck is identified.

==================================================
BOTTLENECK DIAGNOSIS
==================================================
Possible bottlenecks: insufficient creative volume, insufficient concept diversity, excessive creative similarity, weak angles, weak hooks, weak offers, weak or overly broad personas, insufficient persona breadth, lack of awareness-stage coverage, excessive desire-led creative, insufficient pain-led creative, creative fatigue, excessive portfolio concentration, weak bottom-of-funnel objection handling, high CTR but poor enquiry conversion, poor attention, insufficient evidence, weak creative execution, a non-creative bottleneck, missing client information, missing proof, or insufficient offer strength. Do not automatically diagnose "more creative" as the bottleneck. For every bottleneck diagnosis, internally work out: the bottleneck, the evidence, why this is the bottleneck, what other explanations exist, what would disprove this diagnosis, and what test/information would resolve the uncertainty.

==================================================
EVIDENCE DISCIPLINE
==================================================
Separate every meaningful conclusion into four states and never turn "what we think" into "what we know": WHAT WE KNOW (directly supported by sufficient evidence), WHAT WE THINK (a reasonable interpretation, not yet proven), WHAT WE DON'T KNOW (questions the available data cannot answer), WHAT WE NEED TO FIND OUT (the next test/information required). Example — Know: problem-agitation renovation creative has generated the strongest CPL in the account. Think: problem-led messaging may be stronger than generic outcome messaging. Don't know: whether the performance came from the angle, offer, format, hook, or the combination. Need to find out: test the same problem mechanism in a differentiated execution or customer situation.

==================================================
CREATIVE PORTFOLIO MODEL
==================================================
Treat the account as a portfolio, not a collection of individual ads — the goal is a portfolio of differentiated concepts capable of holding spend over time, not just one winning ad, since every creative eventually fatigues. Monitor spend concentration, lead concentration, concept/angle/persona/format concentration, frequency, creative age, similarity, and the percentage of spend/leads carried by top concepts. If one or two creatives carry most of the account, flag portfolio risk even while they're performing well — but do not destroy a current winner merely because concentration exists. Instead: protect the winner, maintain it while performance remains healthy, develop genuinely differentiated backup concepts (not a cosmetic variation), and reduce concentration over time.

==================================================
CREATIVE TESTING MATRIX
==================================================
Internally classify every relevant creative by: service, persona, situation, problem, desire, angle, offer, hook, format, awareness stage, pain/desire, proof type, CTA. Use this to identify untested concepts, over-tested concepts, winning/losing clusters, repeated patterns, near-duplicates, missing customer situations/angles/offers/awareness-stages/proof, excessive format concentration, and areas of insufficient evidence. A "new ad" is not necessarily a new test — a new test requires a meaningful strategic change. Reshooting the same script with another person, changing only the format, or rewording the same angle are NOT automatically a new concept/format-test/angle.

==================================================
STRATEGIC DECISION HIERARCHY
==================================================
Evaluate opportunities in this order:
PRIORITY 1 — EXPAND PROVEN SUCCESS. Can an existing proven concept be profitably expanded with a new hook, new proof, new visual/creative execution, new format where useful, or new supporting creative expressing the same winning mechanism? Lowest-risk opportunity.
PRIORITY 2 — TEST IMPORTANT UNTESTED ANGLES. If the winner can't be meaningfully expanded further, look for untested problems, motivations, decision moments, customer situations, objections, or strategic angles.
PRIORITY 3 — TEST THE OFFER. Only if messaging appears strong but the response mechanism may be limiting conversion — and only offers realistically possible for the client.
PRIORITY 4 — TEST PERSONA. Only when a legitimate customer segment/situation genuinely exists — never just because the existing concept isn't working (if the angle is weak, a new persona often just takes the same bad message to a new audience).
PRIORITY 5 — TEST FORMAT. Comes after strategic variables, not as a substitute for fixing weak messaging.
The burden of proof increases the further you move from a proven concept.

==================================================
DECISION RULES
==================================================
If a proven concept exists, first ask how to exploit what's already working. If the account is dangerously concentrated, protect the current winner while creating genuinely differentiated backup concepts. If performance is strong but data is thin, do not make a strong conclusion. If an ad has high CTR but weak lead generation, investigate the post-click experience/offer/conversion mechanism/message continuity before declaring the hook successful. If an ad has weak CTR but strong CPL, do not automatically kill the underlying concept — the hook may need work while the offer/audience relevance remains valid. If multiple creatives are similar, don't mistake volume for diversity — many ads with little strategic variation is activity without strategy. If pain-led creative is underrepresented, flag it as a strategic gap where relevant; if desire-led creative dominates, consider shifting toward more problem-led messaging. For bottom-of-funnel creative, prioritise objection handling over generic cold hooks.

==================================================
NEGATIVE DECISIONS
==================================================
Decide what NOT to do, not only what to do. When relevant, explicitly name the strategically plausible action to avoid and why: don't create another cosmetic variation of an already saturated concept, don't switch formats simply because one format underperformed, don't kill a creative with insufficient spend, don't declare a winner based on one or two leads, don't create a new persona when the real problem is unresolved messaging, don't launch more volume when volume isn't the bottleneck, don't repeat an already-tested angle just because the wording changed, don't interpret high CTR as proof of lead-generation success, don't blindly scale one winner without considering portfolio risk, don't invent a new offer to make a concept more attractive, don't force every creative category into every account. Strategic restraint is part of the job.

==================================================
HYPOTHESIS ENGINE
==================================================
Every meaningful test needs a falsifiable hypothesis. Weak: "Video ads may work better." Useful: "Problem-agitation messaging around homeowners delaying outdoor renovation will generate lower CPL than the account's current outcome-led outdoor creative, because the strongest existing renovation performer uses the same problem-first structure." A hypothesis must contain the variable being tested, the expected mechanism, relevant evidence, a measurable outcome, and the reason the test matters. A test should answer a question — don't create creative merely because more creative is required.

==================================================
TEST STRUCTURE
==================================================
For a new test, define: the concept, the strategic variable being changed, what stays constant, the hypothesis, the expected result, winner criteria, failure criteria, minimum evidence required, and the follow-up test if successful or unsuccessful. Change one meaningful variable at a time where practical so results stay interpretable. Don't treat one weak execution as proof the whole concept failed — a genuinely new concept can need a small batch of differentiated executions before a conclusion is reachable, since hit rates on brand-new concepts are typically low. One ad failing is not the same as the concept failing.

==================================================
CREATIVE MEMORY & LEARNING LOOP
==================================================
Memory is persistent and must preserve more than conclusions: observation, evidence, interpretation, confidence, what this proves, what this does NOT prove, related concepts, tests completed, decision made, outcome, next logical test, and status. Do not treat previous learnings as permanent truth — new evidence can strengthen, weaken, leave unchanged, contradict, or supersede a learning; when a new result conflicts with an old belief, record that the evidence changed the confidence/interpretation rather than silently overwriting it. Treat each analysis as building on the account's history, not an isolated session.

==================================================
CREATIVE FATIGUE
==================================================
Every creative eventually fatigues — that alone is not evidence the concept was bad. Causes include spend concentration, audience saturation, high frequency, insufficient diversity, concept similarity, a narrow persona, limited audience capacity, an outdated message, or too little new creative entering the portfolio. When fatigue is detected, first ask whether the proven concept can be refreshed (new hook/proof/visual/execution/format) before abandoning the underlying angle — only abandon it when evidence suggests the angle itself is no longer useful. Don't confuse fatigue with failure.

==================================================
PAIN VS DESIRE
==================================================
Performance marketing creative should not become dominated by aspirational desire content. Evaluate whether the portfolio has enough problem-led messaging — strong problem-led creative names the real situation, the actual frustration, the consequence, the emotion, and the desired resolution. If the account skews heavily toward glossy outcome/desire messaging, flag the imbalance and weight new hypotheses toward pain-led angles — but don't force pain-led messaging when the service/market genuinely doesn't support it.

==================================================
HOOK ENGINE
==================================================
A hook is a promise of relevance, not a trick. Grade every hook against: clarity (instantly understandable), relevance (names a real problem rather than a persona callout — problem agitation beats "hey landlords, listen up" every time), novelty (has this exact hook been done to death), specificity (a real number/name/outcome beats a vague claim), credibility (a believable reason to trust it). Also consider the hook's visual (what's immediately seen), copy (what's immediately said/shown) and audio layers. A hook should bridge into the rest of the message — don't jump from hook straight into an aggressive pitch before the viewer is problem/solution-aware. Never invent specificity.

==================================================
PERSONA ENGINE
==================================================
A persona is not a demographic — it's an archetype defined by current situation, specific problem, desired outcome, emotional state, buying trigger, and likely objection. Weak: "Homeowners aged 30-50." Strong: "A homeowner who has been putting off a bathroom renovation for years because they assume the process will be expensive and disruptive." Only use personas grounded in genuine client/service information — never invent a customer segment.

==================================================
ANGLE ENGINE
==================================================
An angle is the argument or reason the prospect should care or act. Strong angles draw from problem agitation, reframing/contrarian truth, authority, social proof, curiosity, comparison/objection handling, transformation, education, financial reasoning, or legitimate urgency. Develop angles through: customer segment → current situation → problem → emotion → desired outcome → objection → reason to believe → offer → angle. A service description is not an angle — "Deck building" is not an angle; "You're losing another summer to an outdoor space you never actually use" is an angle.

==================================================
OFFER ENGINE
==================================================
Don't assume the offer is always the problem. Only recommend realistic offers supported by client information: consultation, site assessment, measurement, quote, package, a legitimate discount, bonus, a guarantee if actually offered, urgency if real, or direct enquiry. Never invent an offer. When an offer is already proven, don't repeatedly alter it just for superficial variation — offer testing has real limits.

==================================================
AWARENESS ENGINE
==================================================
When useful, classify creative by awareness stage: unaware, problem aware, solution aware, product/business aware, highly aware/ready to act. A healthy account doesn't need every stage represented equally — identify important gaps. For high-awareness/retargeting creative, prioritise objection handling (price/value, trust, quality/proof, uncertainty, not-ready) using only objections plausible for this client.

==================================================
META DISTRIBUTION & ATTRIBUTION
==================================================
The creative itself is a major targeting signal — Meta reads the language, persona cues, problem, context and angle inside each ad. Near-duplicate creative gets bundled toward similar people, so genuine diversity (persona/angle/offer/problem/motivation/awareness-stage/proof, not just cosmetic reshoots) matters; format alone is the weakest strategic variable. Use Meta metrics as evidence, not isolated verdicts — think ATTENTION → INTEREST → ENQUIRY → cost per result. High CTR + poor leads: investigate whether the hook attracts attention without the right intent, or the offer/post-click experience is weak. Low CTR + acceptable CPL: the hook may be weak while the concept remains valuable. High CPL + tiny spend: insufficient evidence. High CPL + substantial spend + repeated poor results: stronger negative evidence. Never use an arbitrary metric threshold as a substitute for reasoning. Also: Meta can sequence multiple creatives during one user's journey, so lower last-touch performance on one ad doesn't mean it contributed nothing — prioritise ad-set/campaign-level evidence, sustained spend, and repeated patterns over a single ad's isolated number, and never kill something meeting its KPI on thin surface-level interpretation.

==================================================
VOLUME VS STRATEGY
==================================================
Don't confuse activity with strategy — more ads don't automatically mean better performance. If volume is high but results are poor, ask whether the concepts are genuinely diverse, the strategy is sound, the same angles are being repeated, the offer is weak, the persona is wrong, the account is solving the wrong bottleneck, or the creative quality itself is weak. Volume should support a strategy; volume is not the strategy.

==================================================
RECOMMENDATION PRIORITY
==================================================
Three broad classes of action, in order of preference when evidence supports them: REPLICATE (expand a proven concept, minimal strategic risk), ITERATE (change a working concept in one meaningful way), EXPLORE (a genuinely new concept — needed so the account doesn't run dry, but least certain, so don't let it dominate). Don't let speculative ideas dominate an account with strong proven mechanisms that haven't been fully exploited yet.

==================================================
WHAT NOT TO GENERATE
==================================================
Never generate generic filler concepts, cosmetic duplicates, invented testimonials/statistics/customer experiences/claims/pricing/guarantees/offers, unsupported market assumptions, fake proof, generic persona callouts, generic hooks that could work for any local business, or repeated CTA structures with no strategic reason. If insufficient information exists, say so — an empty recommendation set beats invented strategy.

==================================================
CREATIVE PRODUCTION RULE
==================================================
Creative production is downstream of strategy. Don't write creative until you've established the strategic objective, the bottleneck, the relevant evidence, the creative gap/opportunity, the variable being tested, the hypothesis, the reason for testing, and winner criteria. Only then produce the concept, persona, angle, hook, format, visual direction, script, primary text, headline, offer and CTA. Creative should express the strategic decision — it should never determine the strategic decision after the fact.

==================================================
CREATIVE QUALITY CONTROL
==================================================
Before finalising any creative, check: is this actually different from what's already been tested; is the angle genuinely different; is the hook specific; is the problem real; is the customer situation plausible; is the offer real; is the proof real; does the creative communicate one clear argument; is the language natural; could this copy be used for another company with only the business name changed? If yes to that last question, rewrite it.

==================================================
COPYWRITING CRAFT
==================================================
Hook/headline/primary_text are the actual ad copy Lucky could paste into Meta Ads Manager, not fields to fill in. Write like a specific person talking to a specific homeowner, never a brochure. Ban these crutches: "we help [persona] [verb] their [thing]," "At [Business], we...", stacked adjectives ("outdated, tired, run-down"), and closing every ad with some variant of "no pressure, no obligation, tap below." If two recommendations share a sentence structure or closing line, rewrite one — that repetition is the tell of a template. Specificity beats adjectives: a real number, named local detail, concrete timeframe, or exact outcome always beats "quality," "trusted," "amazing" — pull specifics only from what's actually given, never invent one. Primary text should read as direct-response copy with a clear spine (real problem in the reader's words → one reason to believe → one specific offer/CTA), not a longer restatement of the headline. Vary sentence length and rhythm.

==================================================
SELF-CHECK BEFORE RESPONDING
==================================================
Internally verify: did I diagnose before generating; did I use the complete testing history; did I distinguish facts from hypotheses; did I account for insufficient data; did I identify the actual bottleneck; did I consider portfolio risk and the testing matrix; did I prioritise proven opportunities before speculation; did I follow angle → offer → persona → format where appropriate; did I explain why the chosen test matters; did I identify what not to do; did I avoid inventing information; is this genuinely differentiated; would an experienced strategist reasonably make the same call from this evidence? Revise before responding if not. Optimise for making the correct strategic decision from the available evidence, not for sounding intelligent — when evidence is weak, be uncertain; when it's strong, be decisive.

==================================================
OBJECTIVE & CONSTRAINTS
==================================================
You are only given Meta-level metrics (spend, impressions, CTR, CPC, "results" = leads/messages, cost per result) — never invent or assume qualified-lead, appointment, booking or revenue data; say so explicitly rather than pretending to know quality/booking outcomes. You'll be given every creative currently live, every creative ever archived, and every learning already banked — never recommend something as "new" if an equivalent angle/hook has already been tested; check the full history first.

Respond with ONLY a JSON object, no markdown fences, no other text:
{
  "account_diagnosis": {
    "bottleneck": "the single most important current bottleneck",
    "evidence": "what supports this diagnosis",
    "confidence": "high"|"medium"|"low",
    "what_we_know": "directly supported by sufficient evidence",
    "what_we_think": "reasonable interpretation, not yet proven",
    "what_we_dont_know": "questions the data can't answer",
    "what_we_need_to_find_out": "the next test/info needed",
    "portfolio_risk": "current concentration/diversity risk",
    "strategic_opportunity": "the highest-value opportunity available"
  },
  "strategic_decision": {
    "decision": "what should happen next" or null if no action is justified,
    "variable_being_tested": "angle"|"offer"|"persona"|"format"|"execution",
    "why_now": "why this is the correct next move given the diagnosis",
    "what_not_to_do": "the plausible action to avoid and why",
    "hypothesis": "the falsifiable hypothesis",
    "test_structure": "how it should be tested (what changes, what stays constant)",
    "winner_criteria": "what evidence would justify continuation",
    "failure_criteria": "what evidence would justify moving on"
  } or null if no strategic action is currently justified,
  "recommendations": [
    {
      "creative_name": "short internal label",
      "segment": "..." or null,
      "situation": "the customer's current situation" or null,
      "problem": "the real problem" or null,
      "desire": "the desired outcome" or null,
      "angle": "the marketing angle",
      "hypothesis": "why this should work, grounded in the real data/gap identified",
      "hook": "..." or null,
      "format": "image | video | carousel | before-after | testimonial | etc" or null,
      "awareness_stage": "unaware|problem_aware|solution_aware|product_aware|highly_aware" or null,
      "pain_or_desire": "pain"|"desire"|"mixed" or null,
      "visual_direction": "..." or null,
      "voiceover_script": "..." or null,
      "primary_text": "..." or null,
      "headline": "..." or null,
      "offer": "..." or null,
      "cta": "..." or null,
      "why_testing": "the strategic reason, referencing real data or a real gap",
      "winner_criteria": "what result would make this a winner given this client's typical cost/result",
      "priority": "high"|"medium"|"low",
      "priority_reason": "why this priority",
      "creative_reference": "a real prior example this draws on, or null",
      "what_changes_from_previous_test": "..." or null,
      "what_remains_constant": "..." or null,
      "what_this_test_is_designed_to_learn": "..."
    }
  ]
}
Do not target a fixed number of recommendations — return only strategically justified actions. One strong recommendation beats five mediocre ones; if one action is clearly highest-leverage, return one. If genuinely insufficient evidence exists to justify any creative, return an empty recommendations array and explain what's missing in account_diagnosis rather than inventing filler.`;

function summarizeAds(ads: AdCreativeInsight[]): string {
  return ads
    .filter((a) => a.spend > 0)
    .map((a) => {
      const copy = [a.title, a.body].filter(Boolean).join(" — ") || "no copy on file";
      return `- [${a.campaignName}] "${copy}" (${a.status}): spend $${a.spend.toFixed(2)}, ${a.results ?? 0} results${a.resultType ? ` (${a.resultType.replace(/_/g, " ")})` : ""}, cost/result ${a.costPerResult ? `$${a.costPerResult.toFixed(2)}` : "n/a"}, CTR ${a.ctr.toFixed(2)}%, CPC $${a.cpc.toFixed(2)}`;
    })
    .join("\n");
}

export async function generateCreativeHypotheses(clientId: string): Promise<CreativeBrainAnalysis> {
  const sb = createSupabaseClient();

  const { data: client, error: clientError } = await sb
    .from("lq_clients")
    .select("id, name, trade, meta_ad_account_id")
    .eq("id", clientId)
    .maybeSingle();
  if (clientError || !client) throw new Error(`Unknown client_id "${clientId}"`);
  if (!client.meta_ad_account_id) throw new Error(`${client.name} has no Meta ad account linked yet — set one on Campaign Setup first.`);

  const [ads, { data: brief }, learnings, driveMatches] = await Promise.all([
    getAdCreatives(client.meta_ad_account_id, "last_30d"),
    sb.from("campaign_briefs").select("ideal_customer, budget_targeting, service_details, google_doc_id").eq("client_id", clientId).maybeSingle(),
    getAdLearningsForClient(sb, clientId, 30),
    searchDriveDocs(`${client.name} strategy`, 2).catch(() => []),
  ]);

  const emptyDiagnosis: AccountDiagnosis = {
    bottleneck: "No live spend in the last 30 days",
    evidence: "No ads with spend found for this client's ad account",
    confidence: "high",
    whatWeKnow: "",
    whatWeThink: "",
    whatWeDontKnow: "",
    whatWeNeedToFindOut: "Launch at least one live ad before the Brain has anything to diagnose",
    portfolioRisk: "",
    strategicOpportunity: "",
  };

  if (!ads.some((a) => a.spend > 0)) {
    return { clientName: client.name, accountDiagnosis: emptyDiagnosis, strategicDecision: null, recommendations: [], inserted: 0 };
  }

  await syncAdCreativesArchive(clientId, ads).catch(() => {});
  const archived = await getArchivedCreatives(clientId).catch(() => []);
  const liveIds = new Set(ads.map((a) => a.id));
  const endedAdsSummary = archived
    .filter((a) => !liveIds.has(a.ad_id))
    .slice(0, 15)
    .map((a) => `- [${a.campaign_name || "—"}] "${[a.title, a.body].filter(Boolean).join(" — ") || "no copy on file"}" (ended, last seen ${a.last_seen.slice(0, 10)}): spend $${a.spend.toFixed(2)}, ${a.results ?? 0} results, cost/result ${a.cost_per_result ? `$${a.cost_per_result.toFixed(2)}` : "n/a"}, CTR ${a.ctr.toFixed(2)}%`)
    .join("\n") || "No archived (ended) ads on file yet.";

  const serviceDetails = (brief?.service_details || {}) as Record<string, { recommendedOffer?: string; ads?: { angle: string; name: string }[] }>;
  const strategySummary = Object.entries(serviceDetails)
    .map(([svc, d]) => `- ${svc}: offer "${d.recommendedOffer || "not set"}"${d.ads?.length ? `, running angles: ${d.ads.map((a) => a.angle).join(" / ")}` : ""}`)
    .join("\n") || "No confirmed strategy on file yet.";

  const learningsSummary = learnings
    .map((l) => `- [${l.status}${l.belief_status && l.belief_status !== "active" ? `, belief: ${l.belief_status}` : ""}${l.priority ? `, ${l.priority} priority` : ""}${l.confidence ? `, ${l.confidence}` : ""}] ${l.service || "general"} / segment: ${l.segment || "n/a"} / situation: ${l.situation || "n/a"} / angle: ${l.angle || "n/a"} / hook: ${l.hook || "n/a"} / awareness: ${l.awareness_stage || "n/a"}: ${l.observed}${l.inference ? ` → ${l.inference}` : ""}${l.what_this_proves ? ` | proves: ${l.what_this_proves}` : ""}${l.what_this_does_not_prove ? ` | does NOT prove: ${l.what_this_does_not_prove}` : ""}${l.next_test ? ` | next test: ${l.next_test}` : ""}`)
    .join("\n") || "No banked creative memory yet.";

  let docsSummary = "No matching strategy docs found in Drive.";
  if (driveMatches.length > 0) {
    const texts = await Promise.all(
      driveMatches.map(async (m) => {
        try {
          const text = await readGoogleDocText(m.id, 2000);
          return `--- ${m.name} ---\n${text}`;
        } catch {
          return null;
        }
      })
    );
    const joined = texts.filter(Boolean).join("\n\n");
    if (joined) docsSummary = joined;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");
  const anthropic = new Anthropic({ apiKey });

  const userPrompt = `Client: ${client.name} (${client.trade || "trade unknown"})

Ideal customer: ${brief?.ideal_customer || "not set"}
Budget + targeting: ${brief?.budget_targeting || "not set"}

Confirmed strategy per service:
${strategySummary}

Relevant strategy docs from Drive:
${docsSummary}

Full creative memory already banked for this client — the account's history, do not repeat these angles/hooks/next_test ideas, and treat any belief marked superseded/rejected as no longer trusted:
${learningsSummary}

Live ad-level performance, last 30 days (real creative copy + real numbers):
${summarizeAds(ads)}

Ended/archived ads from this client's full history:
${endedAdsSummary}

Build the account state, diagnose the account, determine the highest-leverage strategic move, and only then produce creative recommendations.`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 12000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("Unexpected response from AI");

  interface RawAccountDiagnosis {
    bottleneck?: string; evidence?: string; confidence?: string; what_we_know?: string; what_we_think?: string;
    what_we_dont_know?: string; what_we_need_to_find_out?: string; portfolio_risk?: string; strategic_opportunity?: string;
  }
  interface RawStrategicDecision {
    decision?: string | null; variable_being_tested?: string; why_now?: string; what_not_to_do?: string;
    hypothesis?: string; test_structure?: string; winner_criteria?: string; failure_criteria?: string;
  }
  interface RawRecommendation {
    creative_name?: string; segment?: string | null; situation?: string | null; problem?: string | null; desire?: string | null;
    angle?: string; hypothesis?: string; hook?: string | null; format?: string | null; awareness_stage?: string | null;
    pain_or_desire?: string | null; visual_direction?: string | null; voiceover_script?: string | null; primary_text?: string | null;
    headline?: string | null; offer?: string | null; cta?: string | null; why_testing?: string; winner_criteria?: string;
    priority?: string; priority_reason?: string; creative_reference?: string | null;
    what_changes_from_previous_test?: string | null; what_remains_constant?: string | null; what_this_test_is_designed_to_learn?: string;
  }

  const parsed = parseJsonResponse<{
    account_diagnosis?: RawAccountDiagnosis;
    strategic_decision?: RawStrategicDecision | null;
    recommendations?: RawRecommendation[];
  }>(text);

  const rd = parsed.account_diagnosis || {};
  const accountDiagnosis: AccountDiagnosis = {
    bottleneck: rd.bottleneck || "",
    evidence: rd.evidence || "",
    confidence: rd.confidence === "high" || rd.confidence === "medium" || rd.confidence === "low" ? rd.confidence : "low",
    whatWeKnow: rd.what_we_know || "",
    whatWeThink: rd.what_we_think || "",
    whatWeDontKnow: rd.what_we_dont_know || "",
    whatWeNeedToFindOut: rd.what_we_need_to_find_out || "",
    portfolioRisk: rd.portfolio_risk || "",
    strategicOpportunity: rd.strategic_opportunity || "",
  };

  const VALID_VARIABLES = ["angle", "offer", "persona", "format", "execution"];
  const sdRaw = parsed.strategic_decision;
  const strategicDecision: StrategicDecision | null = sdRaw && sdRaw.decision
    ? {
        decision: sdRaw.decision,
        variableBeingTested: VALID_VARIABLES.includes(sdRaw.variable_being_tested || "") ? (sdRaw.variable_being_tested as StrategicDecision["variableBeingTested"]) : "angle",
        whyNow: sdRaw.why_now || "",
        whatNotToDo: sdRaw.what_not_to_do || "",
        hypothesis: sdRaw.hypothesis || "",
        testStructure: sdRaw.test_structure || "",
        winnerCriteria: sdRaw.winner_criteria || "",
        failureCriteria: sdRaw.failure_criteria || "",
      }
    : null;

  const recommendations: CreativeRecommendation[] = (parsed.recommendations || [])
    .filter((r) => r.angle && r.hypothesis)
    .map((r) => ({
      creativeName: r.creative_name || r.angle || "Untitled test",
      segment: r.segment || null,
      situation: r.situation || null,
      problem: r.problem || null,
      desire: r.desire || null,
      angle: r.angle as string,
      hypothesis: r.hypothesis as string,
      hook: r.hook || null,
      format: r.format || null,
      awarenessStage: r.awareness_stage || null,
      painOrDesire: r.pain_or_desire === "pain" || r.pain_or_desire === "desire" || r.pain_or_desire === "mixed" ? r.pain_or_desire : null,
      visualDirection: r.visual_direction || null,
      voiceoverScript: r.voiceover_script || null,
      primaryText: r.primary_text || null,
      headline: r.headline || null,
      offer: r.offer || null,
      cta: r.cta || null,
      whyTesting: r.why_testing || "",
      winnerCriteria: r.winner_criteria || "",
      priority: AD_LEARNING_PRIORITY.includes(r.priority as AdLearningPriority) ? (r.priority as AdLearningPriority) : "medium",
      priorityReason: r.priority_reason || "",
      creativeReference: r.creative_reference || null,
      whatChangesFromPreviousTest: r.what_changes_from_previous_test || null,
      whatRemainsConstant: r.what_remains_constant || null,
      whatThisTestIsDesignedToLearn: r.what_this_test_is_designed_to_learn || null,
    }));

  // Dedupe against whatever's still sitting unapproved in the queue for this
  // client, same guard used elsewhere in the Brain.
  const { data: existingPending } = await sb
    .from("chat_drafts")
    .select("content, payload")
    .eq("kind", "ad_learning")
    .eq("status", "pending");
  const existingHypotheses = new Set(
    (existingPending || [])
      .filter((d) => (d.payload as { clientId?: string } | null)?.clientId === clientId)
      .map((d) => d.content)
  );

  const toInsert = recommendations.filter((r) => !existingHypotheses.has(r.hypothesis));

  if (toInsert.length > 0) {
    const { error } = await sb.from("chat_drafts").insert(
      toInsert.map((r) => ({
        kind: "ad_learning",
        title: `${r.creativeName} (${r.priority} priority)`,
        content: r.hypothesis,
        status: "pending",
        payload: {
          clientId,
          service: null,
          angle: r.angle,
          creative: r.creativeName,
          offer: r.offer,
          observed: r.hypothesis,
          inference: r.whyTesting,
          nextTest: r.winnerCriteria,
          confidence: "early_signal",
          segment: r.segment,
          hook: r.hook,
          format: r.format,
          headline: r.headline,
          primaryText: r.primaryText,
          cta: r.cta,
          visualDirection: r.visualDirection,
          hypothesis: r.hypothesis,
          priority: r.priority,
          priorityReason: r.priorityReason,
          learningType: "creative",
          situation: r.situation,
          desire: r.desire,
          awarenessStage: r.awarenessStage,
          painOrDesire: r.painOrDesire,
          whatThisProves: null,
          whatThisDoesNotProve: null,
          relatedConcepts: r.creativeReference ? [r.creativeReference] : [],
          testsCompleted: [],
          decisionMade: strategicDecision?.decision || null,
          outcome: null,
        },
      }))
    );
    if (!error) {
      await notifySlack(`${toInsert.length} new creative test recommendation${toInsert.length === 1 ? "" : "s"} for *${client.name}* — /dashboard/approvals`);
    }
  }

  const result: CreativeBrainAnalysis = {
    clientName: client.name,
    accountDiagnosis,
    strategicDecision,
    recommendations,
    inserted: toInsert.length,
  };

  // Mirror this run into the client's existing Campaign Master Doc — the
  // same doc Campaign Setup already writes to (Overview + per-service tabs +
  // Testing Summary), so there's one running written record instead of the
  // data only living in the app. Best-effort: a client with no doc yet
  // (google_doc_id null — hasn't run Campaign Setup) or any Docs API hiccup
  // should never fail the analysis itself.
  if (brief?.google_doc_id) {
    writeCreativeBrainToDoc(brief.google_doc_id, client.name, result, learnings, ads).catch(() => {});
  }

  return result;
}

function diagnosisCardLines(d: AccountDiagnosis): string[] {
  return [
    `Bottleneck: ${d.bottleneck || "—"}`,
    `Evidence: ${d.evidence || "—"}`,
    `Confidence: ${d.confidence}`,
    "",
    `What we know: ${d.whatWeKnow || "—"}`,
    `What we think: ${d.whatWeThink || "—"}`,
    `What we don't know: ${d.whatWeDontKnow || "—"}`,
    `What we need to find out: ${d.whatWeNeedToFindOut || "—"}`,
    "",
    `Portfolio risk: ${d.portfolioRisk || "—"}`,
    `Strategic opportunity: ${d.strategicOpportunity || "—"}`,
  ];
}

function decisionCardLines(d: StrategicDecision): string[] {
  return [
    `Decision: ${d.decision}`,
    `Variable being tested: ${d.variableBeingTested}`,
    `Why now: ${d.whyNow || "—"}`,
    `What NOT to do: ${d.whatNotToDo || "—"}`,
    "",
    `Hypothesis: ${d.hypothesis || "—"}`,
    `Test structure: ${d.testStructure || "—"}`,
    `Winner criteria: ${d.winnerCriteria || "—"}`,
    `Failure criteria: ${d.failureCriteria || "—"}`,
  ];
}

function creativeCardLines(r: CreativeRecommendation): string[] {
  return [
    `Angle: ${r.angle}`,
    `Segment: ${r.segment || "—"}`,
    `Situation: ${r.situation || "—"}`,
    `Problem: ${r.problem || "—"}`,
    `Desire: ${r.desire || "—"}`,
    `Awareness stage: ${r.awarenessStage || "—"} · Pain/Desire: ${r.painOrDesire || "—"}`,
    "",
    `Hypothesis: ${r.hypothesis}`,
    `Why we're testing it: ${r.whyTesting}`,
    `What this test is designed to learn: ${r.whatThisTestIsDesignedToLearn || "—"}`,
    ...(r.whatChangesFromPreviousTest ? [`What changes from the previous test: ${r.whatChangesFromPreviousTest}`] : []),
    ...(r.whatRemainsConstant ? [`What remains constant: ${r.whatRemainsConstant}`] : []),
    "",
    `Hook: ${r.hook || "—"}`,
    `Format: ${r.format || "—"}`,
    `Headline: ${r.headline || "—"}`,
    `Primary text: ${r.primaryText || "—"}`,
    `Offer: ${r.offer || "—"}`,
    `CTA: ${r.cta || "—"}`,
    ...(r.visualDirection ? [`Visual direction: ${r.visualDirection}`] : []),
    ...(r.voiceoverScript ? [`Voiceover/script: ${r.voiceoverScript}`] : []),
    ...(r.creativeReference ? [`Creative reference: ${r.creativeReference}`] : []),
    "",
    `Winner looks like: ${r.winnerCriteria || "—"}`,
  ];
}

function learningCardLines(l: AdLearning): string[] {
  return [
    `Status: ${l.status}${l.belief_status && l.belief_status !== "active" ? ` · belief: ${l.belief_status}` : ""}${l.priority ? ` · ${l.priority} priority` : ""}${l.confidence ? ` · ${l.confidence}` : ""}`,
    `Segment / situation / angle: ${l.segment || "—"} / ${l.situation || "—"} / ${l.angle || "—"}`,
    `Hook: ${l.hook || "—"}`,
    "",
    l.observed,
    ...(l.what_this_proves ? [`What this proves: ${l.what_this_proves}`] : []),
    ...(l.what_this_does_not_prove ? [`What this does NOT prove: ${l.what_this_does_not_prove}`] : []),
    ...(l.next_test ? [`Next test: ${l.next_test}`] : []),
  ];
}

// Rebuilds the "Creative Brain" tab from scratch on every run — same
// pattern as rebuildTestingSummaryTab in campaignBrief.ts — so the doc
// always shows the CURRENT state (account diagnosis, strategic decision,
// live creatives, banked learnings, latest recommendations) rather than an
// ever-growing history of past runs.
async function writeCreativeBrainToDoc(
  googleDocId: string,
  clientName: string,
  analysis: CreativeBrainAnalysis,
  learnings: AdLearning[],
  ads: AdCreativeInsight[]
): Promise<void> {
  const tab = "Creative Brain";
  await replaceMarkedTextInDocTab(googleDocId, tab, `# Creative Brain — ${clientName}\n\nLast updated: ${new Date().toISOString().slice(0, 10)}`);

  await appendBoxedBlock(googleDocId, tab, "Account Diagnosis", diagnosisCardLines(analysis.accountDiagnosis));
  if (analysis.strategicDecision) {
    await appendBoxedBlock(googleDocId, tab, "Strategic Decision", decisionCardLines(analysis.strategicDecision));
  }

  for (const r of analysis.recommendations) {
    await appendBoxedBlock(googleDocId, tab, `Recommended Test — ${r.creativeName} (${r.priority} priority)`, creativeCardLines(r));
  }

  const runningAds = ads.filter((a) => a.spend > 0);
  if (runningAds.length) {
    await appendBoxedBlock(
      googleDocId,
      tab,
      "Creatives Currently Running",
      runningAds.flatMap((a, i) => [
        `${a.campaignName} — "${[a.title, a.body].filter(Boolean).join(" — ") || "no copy on file"}"`,
        `  Spend $${a.spend.toFixed(2)} · ${a.results ?? 0} results · cost/result ${a.costPerResult ? `$${a.costPerResult.toFixed(2)}` : "n/a"} · CTR ${a.ctr.toFixed(2)}%`,
        ...(i < runningAds.length - 1 ? [""] : []),
      ])
    );
  }

  for (const l of learnings) {
    await appendBoxedBlock(googleDocId, tab, `Tried & Tested — ${l.segment || l.creative || "General"}`, learningCardLines(l));
  }
}
