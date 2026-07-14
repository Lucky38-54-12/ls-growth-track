import Anthropic from "@anthropic-ai/sdk";
import { stripDashes, parseJsonResponse } from "./ai";
import { CallOutcome, SalesCall, ScriptDiff } from "./types";

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
// 2. Review a logged call against the current master script
// ---------------------------------------------------------------------------

export interface ScriptReview {
  needs_changes: boolean;
  summary: string;
  diffs: ScriptDiff[];
  new_content: string;
}

const SCRIPT_REVIEW_SYSTEM_PROMPT = `You help Lucky keep his master sales script up to date. Lucky sells ad services (Meta ads, lead generation) to trade businesses. You will be given his current master script and the full details of a call he just logged, including his own honest reflection on the call in his words (went_well and work_ons). Treat his own reflection as the primary signal, it's him telling you where he mucked up or what actually landed, weigh it above your own read of the raw transcript.

Your job is to check the call against the script and decide if the script needs updating:
- Did Lucky say in his own reflection that he mucked up, skipped something, or froze on something the script should have covered him for?
- Did the prospect raise an objection that isn't in the "Objection cheat sheet" section? If so the fix is almost always adding a new entry to that section, not touching anything else.
- Did Lucky say something worked well that should be captured so he repeats it?

If nothing in this call actually justifies a change, say so plainly and propose no edits. Do not invent changes just to have something to propose. Most single calls should not require a script change.

If changes are worth making, propose specific edits as before and after pairs. Each edit should be additive and targeted to the smallest relevant part of the script, either a new entry in the objection cheat sheet, a tightened line in the section where Lucky said he mucked up, or (only if nothing in the current structure fits) a new section. Never rewrite the whole script. Give a one sentence reason for each edit that references what Lucky actually said happened.

${WRITING_RULES}

Respond with ONLY a JSON object, no markdown fences, no other text:
{"needs_changes": false, "summary": "one or two sentences on your assessment", "diffs": [{"before": "exact text from the current script being replaced", "after": "the replacement text", "reason": "one sentence"}], "new_content": "the full script with the diffs applied, or empty string if needs_changes is false"}`;

export async function reviewScriptAgainstCall(scriptContent: string, call: ParsedCall & { raw_summary: string }): Promise<ScriptReview> {
  const userPrompt = `Current master script:
"""
${scriptContent}
"""

Call details:
Outcome: ${call.outcome}
Main objection: ${call.main_objection || "none"}
Next step booked: ${call.next_step_booked ? call.next_step_detail : "no"}
What went well: ${call.went_well || "none noted"}
Work ons: ${call.work_ons || "none noted"}

Raw notetaker summary of the call:
"""
${call.raw_summary}
"""`;

  const msg = await client().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SCRIPT_REVIEW_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<Partial<ScriptReview>>(block.text);
  const diffs = (parsed.diffs || []).map((d) => ({
    before: d.before || "",
    after: stripDashes(d.after || ""),
    reason: stripDashes(d.reason || ""),
  }));

  return {
    needs_changes: !!parsed.needs_changes && diffs.length > 0,
    summary: stripDashes(parsed.summary || ""),
    diffs,
    new_content: parsed.new_content ? stripDashes(parsed.new_content) : "",
  };
}

// ---------------------------------------------------------------------------
// 3. Generate a tailored call prep: prep card + tailored script
// ---------------------------------------------------------------------------

export interface CallPrepInput {
  prospectName: string;
  businessName: string;
  industry: string;
  notes: string;
  masterScript: string;
  recentWorkOns: string[];
  recentObjections: string[];
}

export interface CallPrepResult {
  topWorkOns: string[];
  likelyObjections: string[];
  reminder: string;
  tailoredScript: string;
}

const CALL_PREP_SYSTEM_PROMPT = `You prepare Lucky for an upcoming sales call. Lucky sells ad services (Meta ads, lead generation) to trade businesses.

You will be given his master sales script, details on the specific prospect he is about to call, a list of his own recurring work ons from recent calls, and a list of objections that have come up recently.

Produce:
1. topWorkOns: the top 3 recurring things Lucky should watch himself on this call, pulled from the recent work ons given to you. If fewer than 3 distinct themes exist, return fewer, do not pad with generic advice.
2. likelyObjections: 2 to 4 objections this specific prospect is most likely to raise, based on their industry and the objections history given to you. If nothing in the history matches this industry well, use general trade business objections instead, but keep it grounded, do not invent something exotic.
3. reminder: one short reminder line about locking a concrete next step before hanging up.
4. tailoredScript: a version of the master script personalised for this specific prospect, using their name, business, industry and any notes given. Keep the same structure and flow as the master script but make it feel written for this exact call, not generic.

${WRITING_RULES}

Respond with ONLY a JSON object, no markdown fences, no other text:
{"topWorkOns": [], "likelyObjections": [], "reminder": "", "tailoredScript": ""}`;

export async function generateCallPrep(input: CallPrepInput): Promise<CallPrepResult> {
  const userPrompt = `Master script:
"""
${input.masterScript}
"""

Prospect: ${input.prospectName || "unknown name"}
Business: ${input.businessName || "unknown business"}
Industry: ${input.industry || "unknown industry"}
Notes from booking: ${input.notes || "none"}

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
    max_tokens: 2048,
    system: CALL_PREP_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
  });

  if (msg.stop_reason === "refusal") {
    throw new Error("Couldn't generate a prep for this one, try rephrasing the notes.");
  }

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<Partial<CallPrepResult>>(block.text);

  return {
    topWorkOns: (parsed.topWorkOns || []).map((s) => stripDashes(s)),
    likelyObjections: (parsed.likelyObjections || []).map((s) => stripDashes(s)),
    reminder: stripDashes(parsed.reminder || "Lock in a concrete next step before you hang up."),
    tailoredScript: stripDashes(parsed.tailoredScript || input.masterScript),
  };
}

// ---------------------------------------------------------------------------
// Helper shared by the review route: SalesCall row -> ParsedCall shape
// ---------------------------------------------------------------------------

export function callToParsed(call: SalesCall): ParsedCall & { raw_summary: string } {
  return {
    call_date: call.call_date,
    prospect_name: call.prospect_name,
    business_name: call.business_name,
    outcome: call.outcome,
    main_objection: call.main_objection,
    next_step_booked: call.next_step_booked,
    next_step_detail: call.next_step_detail,
    went_well: call.went_well,
    work_ons: call.work_ons,
    raw_summary: call.raw_summary,
  };
}
