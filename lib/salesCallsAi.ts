import Anthropic from "@anthropic-ai/sdk";
import { stripDashes, parseJsonResponse } from "./ai";
import { CallOutcome, ScriptDiff } from "./types";

const WRITING_RULES = `Writing rules, no exceptions:
- Plain spoken New Zealand English. Write it the way Lucky would actually say it out loud on a call, never like written marketing copy.
- No dashes or em dashes anywhere.
- Short sentences.
- No corporate filler. Never say things like "leverage", "circle back", "value proposition", "synergy", "reach out", "touch base".`;

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");
  return new Anthropic({ apiKey });
}

// ---------------------------------------------------------------------------
// 1. Parse a raw notetaker summary into structured call fields
// ---------------------------------------------------------------------------

export interface ParsedCall {
  call_date: string;
  prospect_name: string;
  business_name: string;
  outcome: CallOutcome;
  main_objection: string;
  next_step_booked: boolean;
  next_step_detail: string;
  went_well: string;
  work_ons: string;
}

const PARSE_SYSTEM_PROMPT = `You read raw notetaker summaries of sales calls for Lucky, who runs LS Growth, an agency that sells ad services (Meta ads, lead generation) to trade businesses (electricians, plumbers, builders, cleaners, etc).

Notetaker summaries sometimes swap or mislabel speaker names. Work out who is who from context, not from whatever label the notetaker used: Lucky is the one selling ad services, asking questions about their business and pitching LS Growth. The prospect is the one who runs the trade business and is being sold to. Use this to correctly attribute who said what, and to find the prospect's actual first name and business name even if the transcript labels are wrong or swapped.

Extract these fields from the summary:
- call_date: the date of the call if mentioned, in YYYY-MM-DD format. If not mentioned, use today's date given below.
- prospect_name: the prospect's first name.
- business_name: the name of the prospect's trade business.
- outcome: exactly one of "closed" (they signed up or agreed to pay), "follow_up" (a specific next call or action was booked), "undecided" (call ended with no clear next step and no decision), "dead" (they said no or are clearly not interested).
- main_objection: the main hesitation or pushback the prospect raised, in one plain sentence. Empty string if none came up.
- next_step_booked: true only if a specific next step was actually locked in (a date, a time, a concrete action both sides agreed to). False for anything vague like "I will think about it" or "call me sometime".
- next_step_detail: what that next step actually is, in one plain sentence. Empty string if next_step_booked is false.
- went_well: one or two short sentences on what Lucky did well on this call, from Lucky's side.
- work_ons: one or two short sentences on what Lucky should do differently next time, from Lucky's side. Be honest and specific, not generic.

${WRITING_RULES}

Respond with ONLY a JSON object, no markdown fences, no other text:
{"call_date": "", "prospect_name": "", "business_name": "", "outcome": "", "main_objection": "", "next_step_booked": false, "next_step_detail": "", "went_well": "", "work_ons": ""}`;

export async function parseCallSummary(rawSummary: string): Promise<ParsedCall> {
  const today = new Date().toISOString().split("T")[0];

  const msg = await client().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: PARSE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Today's date: ${today}\n\nRaw call summary:\n"""\n${rawSummary}\n"""` }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<Partial<ParsedCall>>(block.text);

  const outcome: CallOutcome = ["closed", "follow_up", "undecided", "dead"].includes(parsed.outcome as string)
    ? (parsed.outcome as CallOutcome)
    : "undecided";

  return {
    call_date: parsed.call_date || today,
    prospect_name: parsed.prospect_name || "",
    business_name: parsed.business_name || "",
    outcome,
    main_objection: stripDashes(parsed.main_objection || ""),
    next_step_booked: !!parsed.next_step_booked,
    next_step_detail: stripDashes(parsed.next_step_detail || ""),
    went_well: stripDashes(parsed.went_well || ""),
    work_ons: stripDashes(parsed.work_ons || ""),
  };
}

// ---------------------------------------------------------------------------
// 2. Standing review: run the full pattern-tracking review across every
// logged call, not just the one that just landed. This is the automated
// version of the review Lucky asked to run after every call, permanently.
// ---------------------------------------------------------------------------

export interface StandingReviewCallRef {
  id: string;
  call_date: string;
  outcome: CallOutcome;
  main_objection: string;
  next_step_booked: boolean;
  next_step_detail: string;
  went_well: string;
  work_ons: string;
}

export interface StandingReviewPatternInput {
  id: string;
  pattern_summary: string;
  status: "open" | "closed";
  cost: "low" | "medium" | "high";
  occurrences: number;
  fix_applied_at: string | null;
  fix_landing_status: "untested" | "holding" | "not_landing";
}

export interface RankedPattern {
  matchesExistingPatternId: string | null;
  summary: string;
  cost: "low" | "medium" | "high";
  callIds: string[];
  status: "open" | "closed";
  isRepeat: boolean;
  closedReason: string;
}

export interface StandingReviewResult {
  rankedPatterns: RankedPattern[];
  needs_changes: boolean;
  summary: string;
  diffs: ScriptDiff[];
  new_content: string;
  fixesPatternSummary: string;
  decisionsToSurface: string[];
  fixNotLandingWarning: string;
}

const STANDING_REVIEW_SYSTEM_PROMPT = `You review Lucky's master sales script against his real logged call data. Lucky sells ad services (Meta ads, lead generation) to trade businesses. This runs automatically after every call he logs, permanently, whether he asks for it or not.

Rules, follow exactly, do not soften any of this:

1. Read every logged call given to you. Pull out recurring patterns: where in the call deals stall, which objections come up more than once, any point Lucky repeatedly struggles to explain or execute. Rank by how often they appear and how much they cost him, a miss that killed a close outranks a minor wording issue. A pattern needs at least two occurrences across different calls to count as a real pattern. Something that happened once is noise, not a pattern, note it but do not act on it yet.

2. For each pattern, check if the current script actually addresses it in a way that would change his behaviour on the call. Be strict. An instruction that exists but that a later call shows he still did not follow does NOT count as addressed. If he read the script and still made the mistake, the script did not catch him.

3. You are given the existing tracked pattern list (open and closed, with occurrence counts and whether a fix has already been applied). For each one, check if it shows up again in the calls given to you:
   - If it shows up again after a fix was already applied to the script (fix_applied_at is set), that is the headline. Say plainly this pattern has now happened more than once and the fix has not stopped it. Set fixNotLandingWarning to a direct plain sentence saying the fix is not landing and this looks like an execution problem under pressure, not a wording problem, then suggest something concrete and different, a mid-call checklist, a pre-call reminder, or a change to how he opens rather than how he closes. Do not just reword the script again for a pattern already flagged as not landing.
   - If it shows up again but no fix has been applied yet, it is still open, just now with another occurrence, and this is your top priority pattern this run, ranked above anything new.
   - If a pattern had a fix applied and none of the calls after that fix show it happening again, it can move to closed. Only close a pattern if there is at least one call logged after fix_applied_at that does not show the issue. Do not close a pattern just because a fix was made if no call has happened since.

4. Only propose script changes that fix a ranked pattern (two or more occurrences). Prioritise the single highest cost recurring pattern first. Do not add new sections for a problem that appeared once. Do not touch parts of the script that are working. Propose at most one change per run unless multiple patterns are both severe and unaddressed, and if you propose more than one, still rank them and say which is most urgent.

5. Anything Lucky struggles to execute under pressure should become something he can see and act on mid-call, a short checklist of concrete actions, not a paragraph of advice to remember. If an existing fix for a pattern is written as a paragraph and the pattern is about execution under pressure, sharpening it into a checklist counts as fixing it properly, reference the instruction fixing on instruction 5.

6. If a real gap has no fix in the current script, propose one. If the script already handles a pattern well, say so in your summary and leave that part alone.

Also flag anything the calls suggest Lucky should decide but has not, for example whether a guarantee number should flex by job size, or whether a different approach is needed for bigger or more intimidating prospects. Do not invent a decision for him, just surface it plainly in decisionsToSurface if the data actually points at one. Leave this empty if nothing genuinely comes up.

For every entry in rankedPatterns, set matchesExistingPatternId to the id of the existing tracked pattern it matches if one was given to you, or null if this is a brand new pattern not seen before. Set isRepeat to true only if this pattern has now happened in more than one call (including calls from before this run). Include every pattern you found, even single occurrence ones and even ones you are not proposing a fix for, so a full list can be shown. Set closedReason only when status is closed, explaining in one sentence which later call proves it is fixed.

${WRITING_RULES}

If needs_changes is true, also set fixesPatternSummary to the exact summary text (from rankedPatterns) of the single pattern these diffs address, so it can be linked up.

Respond with ONLY a JSON object, no markdown fences, no other text:
{"rankedPatterns": [{"matchesExistingPatternId": null, "summary": "", "cost": "low", "callIds": [], "status": "open", "isRepeat": false, "closedReason": ""}], "needs_changes": false, "summary": "one or two sentences on your overall assessment this run", "diffs": [{"before": "exact text from the current script being replaced", "after": "the replacement text", "reason": "one sentence tying this to the specific calls it came from"}], "new_content": "the full script with the diffs applied, or empty string if needs_changes is false", "fixesPatternSummary": "", "decisionsToSurface": [], "fixNotLandingWarning": ""}`;

export async function runStandingScriptReview(
  scriptContent: string,
  allCalls: StandingReviewCallRef[],
  existingPatterns: StandingReviewPatternInput[]
): Promise<StandingReviewResult> {
  const callsBlock = allCalls
    .map((c) => `Call ${c.id} (${c.call_date}):
Outcome: ${c.outcome}
Main objection: ${c.main_objection || "none"}
Next step booked: ${c.next_step_booked ? c.next_step_detail : "no"}
What went well: ${c.went_well || "none noted"}
Work ons: ${c.work_ons || "none noted"}`)
    .join("\n\n");

  const patternsBlock = existingPatterns.length
    ? existingPatterns
        .map((p) => `- id ${p.id}: "${p.pattern_summary}" | status ${p.status} | cost ${p.cost} | occurrences ${p.occurrences} | fix applied at ${p.fix_applied_at || "no fix applied yet"} | fix landing status ${p.fix_landing_status}`)
        .join("\n")
    : "none tracked yet, this is the first run";

  const userPrompt = `Current master script:
"""
${scriptContent}
"""

Every logged call, oldest first:
${callsBlock}

Existing tracked patterns from previous runs:
${patternsBlock}`;

  const msg = await client().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: STANDING_REVIEW_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<Partial<StandingReviewResult>>(block.text);

  const rankedPatterns: RankedPattern[] = (parsed.rankedPatterns || []).map((p) => ({
    matchesExistingPatternId: p.matchesExistingPatternId || null,
    summary: stripDashes(p.summary || ""),
    cost: (["low", "medium", "high"].includes(p.cost as string) ? p.cost : "medium") as "low" | "medium" | "high",
    callIds: p.callIds || [],
    status: p.status === "closed" ? "closed" : "open",
    isRepeat: !!p.isRepeat,
    closedReason: stripDashes(p.closedReason || ""),
  }));

  const diffs = (parsed.diffs || []).map((d) => ({
    before: d.before || "",
    after: stripDashes(d.after || ""),
    reason: stripDashes(d.reason || ""),
  }));

  return {
    rankedPatterns,
    needs_changes: !!parsed.needs_changes && diffs.length > 0,
    summary: stripDashes(parsed.summary || ""),
    diffs,
    new_content: parsed.new_content ? stripDashes(parsed.new_content) : "",
    fixesPatternSummary: parsed.fixesPatternSummary || "",
    decisionsToSurface: (parsed.decisionsToSurface || []).map((s) => stripDashes(s)),
    fixNotLandingWarning: stripDashes(parsed.fixNotLandingWarning || ""),
  };
}

// ---------------------------------------------------------------------------
// 3. Generate a tailored call prep: prep card + tailored script
// ---------------------------------------------------------------------------

export interface CallPrepInput {
  notes: string;
  masterScript: string;
  recentWorkOns: string[];
  recentObjections: string[];
}

export interface CallPrepResult {
  prospectName: string;
  businessName: string;
  topWorkOns: string[];
  likelyObjections: string[];
  reminder: string;
  tailoredScript: string;
}

const CALL_PREP_SYSTEM_PROMPT = `You prepare Lucky for an upcoming sales call. Lucky sells ad services (Meta ads, lead generation) to trade businesses.

You will be given his master sales script, a freeform blob of whatever Lucky knows about the prospect he's about to call (could be a name, business, industry, notes from booking, all mixed together in any order), a list of his own recurring work ons from recent calls, and a list of objections that have come up recently.

First, read the freeform notes and work out the prospect's name, business name, and industry as best you can. If something isn't mentioned, leave it blank, do not guess or invent one.

Then produce:
1. prospectName, businessName: pulled from the notes.
2. topWorkOns: the top 3 recurring things Lucky should watch himself on this call, pulled from the recent work ons given to you. If fewer than 3 distinct themes exist, return fewer, do not pad with generic advice.
3. likelyObjections: 2 to 4 objections this specific prospect is most likely to raise, based on their industry and the objections history given to you. If nothing in the history matches this industry well, use general trade business objections instead, but keep it grounded, do not invent something exotic.
4. reminder: one short reminder line about locking a concrete next step before hanging up.
5. tailoredScript: a version of the master script personalised for this specific prospect, using whatever name, business, industry and notes you found. Keep the same structure and flow as the master script but make it feel written for this exact call, not generic.

${WRITING_RULES}

Respond with ONLY a JSON object, no markdown fences, no other text:
{"prospectName": "", "businessName": "", "topWorkOns": [], "likelyObjections": [], "reminder": "", "tailoredScript": ""}`;

export async function generateCallPrep(input: CallPrepInput): Promise<CallPrepResult> {
  const userPrompt = `Master script:
"""
${input.masterScript}
"""

What Lucky knows about this prospect, freeform:
"""
${input.notes || "nothing, this is a cold booking with no details"}
"""

Lucky's recent work ons (most recent first):
${input.recentWorkOns.length ? input.recentWorkOns.map((w) => `- ${w}`).join("\n") : "none logged yet"}

Objections that have come up recently across all calls:
${input.recentObjections.length ? input.recentObjections.map((o) => `- ${o}`).join("\n") : "none logged yet"}`;

  // Fable 5: Anthropic's most capable model, used here since this is the one
  // call that has to both synthesise a prospect's likely objections and write
  // a full tailored script from it. Its safety classifiers occasionally
  // false-positive on ordinary business content, so this ships with the
  // recommended server-side fallback to Opus 4.8 rather than failing the
  // whole prep on a refusal.
  const msg = await client().beta.messages.create({
    model: "claude-fable-5",
    max_tokens: 8192,
    system: CALL_PREP_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
  });

  if (msg.stop_reason === "refusal") {
    throw new Error("Couldn't generate a prep for this one, try rephrasing the notes.");
  }

  const block = msg.content.find((b) => b.type === "text");
  if (!block) throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<Partial<CallPrepResult>>(block.text);

  return {
    prospectName: parsed.prospectName || "",
    businessName: parsed.businessName || "",
    topWorkOns: (parsed.topWorkOns || []).map((s) => stripDashes(s)),
    likelyObjections: (parsed.likelyObjections || []).map((s) => stripDashes(s)),
    reminder: stripDashes(parsed.reminder || "Lock in a concrete next step before you hang up."),
    tailoredScript: stripDashes(parsed.tailoredScript || input.masterScript),
  };
}

