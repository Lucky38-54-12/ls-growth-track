import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { fetchWebsiteSnippet } from "./website";
import { PERL_WHITELIST, PerlJobType, ALLOWED_CASE_STUDY_NAMES, ALLOWED_PROOF_SENTENCES } from "./proofPoints";
import { InitialVariant, SequenceStep } from "./emailTemplates";

// Lucky's explicit voice rules (2026-07-15) — every prompt that writes text
// a lead or client actually reads must load and follow this file, not just
// the inline rules baked into each system prompt below. Read once per
// process and cached; a missing file falls back to the inline rules alone
// rather than crashing email generation.
let cachedWritingStyle: string | null = null;
function loadWritingStyle(): string {
  if (cachedWritingStyle !== null) return cachedWritingStyle;
  try {
    cachedWritingStyle = fs.readFileSync(path.join(process.cwd(), "writing-style.md"), "utf-8");
  } catch {
    console.error("writing-style.md not found — generating without Lucky's voice rules");
    cachedWritingStyle = "";
  }
  return cachedWritingStyle;
}

export function withWritingStyle(systemPrompt: string): string {
  const style = loadWritingStyle();
  if (!style) return systemPrompt;
  return `${systemPrompt}\n\nLUCKY'S WRITING STYLE — mandatory, follow exactly for every sentence you write:\n${style}`;
}

// Leads imported without a real contact name get stored as the literal
// placeholder "there" (so templates can write "Hey there,"). When feeding a
// name into an AI prompt we want that treated as "no name known", not as if
// "There" were someone's actual first name.
function realName(name: string | null | undefined): string {
  const trimmed = (name || "").trim();
  return trimmed && trimmed.toLowerCase() !== "there" ? trimmed : "";
}

// The model reliably slips an em/en dash into cold outreach copy no matter
// how the "no dashes" rule is worded — it's a stylistic habit that prompt
// wording alone hasn't fixed after repeated attempts. Enforce it
// deterministically instead of relying on compliance: convert dash-joined
// clauses into comma-joined ones so the rule can never actually fail.
export function stripDashes(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/,(\s*[.!?])/g, "$1");
}

// Models sometimes wrap JSON in ```json fences, or (despite explicit
// instructions not to) write out a full reasoning narration before the JSON
// object — try increasingly permissive extraction strategies before giving
// up and letting the caller's catch handle a genuinely bad response.
export function parseJsonResponse<T>(text: string): T {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  const attempts = [
    () => JSON.parse(stripped),
    // Greedy first-{ to last-} — works when the JSON is the only braces present.
    () => {
      const m = stripped.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("no braces found");
      return JSON.parse(m[0]);
    },
    // Last-{ to its matching last-} — works when narration before the JSON
    // happens to contain stray braces the greedy match would over-capture.
    () => {
      const start = stripped.lastIndexOf("{");
      const end = stripped.lastIndexOf("}");
      if (start === -1 || end === -1 || end < start) throw new Error("no trailing object found");
      return JSON.parse(stripped.slice(start, end + 1));
    },
  ];

  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      continue;
    }
  }

  if (process.env.DEBUG_AI_PARSE) console.error("RAW AI RESPONSE:\n", text);
  throw new Error(`Could not parse AI response as JSON: ${text.slice(0, 200)}`);
}

export interface PersonalizedEmail {
  subject: string;
  bodyHtml: string;
}

// Rewritten 2026-07-15 — the AI no longer writes any part of the cold
// outreach sequence. Every sequence email is a fixed template in
// lib/emailTemplates.ts; the AI's only remaining job is to research a lead
// and fill in a handful of slot values (job type, matched job types,
// variant, confirmed first name). This replaces the old
// generateCampaignStepEmail/reviseCampaignStepEmail, which authored full
// email copy and is why a fabricated case study ("Cooper Electrical") ended
// up baked into the prompt and sent to real leads.
export interface ExtractLeadSlotsInput {
  company: string;
  contactName: string;
  trade: string;
  location: string;
  notes: string;
  website?: string | null;
  facebook?: string | null;
}

export type ExtractLeadSlotsResult =
  | { notAFit: true; reason: string }
  | {
      notAFit?: false;
      jobType: string;
      matchedJobTypes: PerlJobType[];
      variant: InitialVariant;
      confirmedFirstName: string | null;
    };

const SLOT_EXTRACTION_SYSTEM_PROMPT = `You research an electrical business for Lucky at LS Growth before he sends a fixed, pre-written cold email to them. You do not write any email copy — every email is already written and locked. Your only job is to research this one business and fill in a few slot values from what you actually find.

SOURCE ORDER — use the first one that gives you real information, and stop once you have enough:
1. Real text scraped from their website, if given below.
2. If the website is thin, missing, or gave nothing useful, use the web_search tool to find their Facebook page.
3. If Facebook gives nothing useful either, use the web_search tool to find their Google Business profile / Google Maps listing.

ONLY use services the business explicitly states it offers, in its own words, in one of those three sources. Never infer a service from a photo, from a customer review, or from "they're an electrician so they probably do X". A generic listing like "residential and commercial electrical work" is NOT a confirmed specific service — treat that as nothing confirmed.

YOUR JOB, in order:

1. EXTRACT confirmed services — the specific things this business explicitly says it does (e.g. "heat pump installs", "switchboard upgrades", "solar panel installation", "EV charger installs", "rewiring"). If genuinely nothing specific is confirmed anywhere, confirmed services is empty.

2. FILL job_type — their single most prominent confirmed service, phrased the way a tradie would say it out loud, all lowercase, no punctuation (e.g. "heat pumps", "switchboard upgrades", "ev charger installs"). If confirmed services is empty, job_type is exactly "electrical work".

3. FILL matched_job_types — up to 3 of the confirmed services that are also in this exact whitelist: heat pumps, solar, switchboard upgrades. Only include a whitelist term if their own confirmed services genuinely match it. If none match, matched_job_types is an empty array — do not force a match.

4. DECIDE variant:
   - "solar" only if solar work is clearly the business's dominant, headline service (not just one line among several services)
   - otherwise "with_name" if a real contact first name is confirmed (see step 5)
   - otherwise "no_name"

5. CONFIRM a first name — ONLY from an explicit statement naming a real person as the owner, founder, director, or main contact (e.g. "Owner: John Smith", "Run by Sarah and her team", a staff/about page naming them). Do NOT guess a name from the business name itself (e.g. "Mike's Electrical" does not confirm a person named Mike unless a source also explicitly says so) and do NOT guess from an email address. If nothing explicitly confirms a real person's name, confirmed_first_name is null.

6. FLAG not_a_fit instead of the above if the business is clearly:
   - A national utility, lines company, or retailer, not a local trade business
   - A tender-only or developer-relationship contractor with no day-to-day residential/small-commercial callout work
   - A franchise head office / corporate parent, not an individual local branch
   - Confirmed NOT to be an electrical trade business at all
   When in doubt and it's an ordinary local electrical business, do not flag it — this is only for clear, obvious cases. You only see this one business's own research, so don't try to judge whether it's a duplicate branch of a franchise contacted elsewhere in the same campaign — only flag a franchise HEAD OFFICE itself if this business clearly is one.

Respond with ONLY a JSON object as your final message, no markdown fences, no other text:
{"not_a_fit": true, "reason": "..."}
or
{"job_type": "...", "matched_job_types": ["..."], "variant": "solar" or "with_name" or "no_name", "confirmed_first_name": "John" or null}`;

export async function extractLeadSlots(input: ExtractLeadSlotsInput): Promise<ExtractLeadSlotsResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });

  const websiteSnippet = input.website?.trim() ? await fetchWebsiteSnippet(input.website.trim()) : "";

  const userPrompt = `Business: ${input.company}
Trade: ${input.trade || "unknown"}
Location: ${input.location || "unknown"}
Website: ${input.website || "none found"}
Facebook: ${input.facebook || "none found"}
Notes on file: ${input.notes || "none"}
${websiteSnippet ? `\nReal text scraped from their website:\n${websiteSnippet}` : "\nNo website text available — use the web_search tool per the source order above."}`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SLOT_EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 } as const],
  });

  // With web search enabled, content can interleave search-related blocks
  // with text — the final JSON is written as the last text block, not
  // necessarily content[0].
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<{
    not_a_fit?: boolean;
    reason?: string;
    job_type?: string;
    matched_job_types?: string[];
    variant?: string;
    confirmed_first_name?: string | null;
  }>(text);

  if (parsed.not_a_fit) {
    return { notAFit: true, reason: parsed.reason || "AI judged this business not a fit for LS Growth's ICP." };
  }

  const jobType = (parsed.job_type || "electrical work").trim().toLowerCase();
  const matchedJobTypes = (parsed.matched_job_types || []).filter(
    (j): j is PerlJobType => (PERL_WHITELIST as readonly string[]).includes(j)
  ).slice(0, 3);
  const confirmedFirstName = parsed.confirmed_first_name?.trim() || null;
  // A "with_name"/"solar" verdict with no actual confirmed name is a model
  // slip, not a real signal — the templates for both variants require a
  // name, so downgrade to "no_name" rather than rendering "Hey ," (missing
  // name text) into a real email.
  const rawVariant = parsed.variant === "solar" || parsed.variant === "with_name" || parsed.variant === "no_name" ? parsed.variant : "no_name";
  const variant: InitialVariant = rawVariant !== "no_name" && !confirmedFirstName ? "no_name" : rawVariant;

  return { jobType, matchedJobTypes, variant, confirmedFirstName };
}

export interface EmailQualityInput {
  subject: string;
  bodyHtml: string;
  step: SequenceStep | "cold_call_followup";
  contactName?: string | null;
  notes?: string | null;
  personalizationHook?: string | null;
  website?: string | null;
  websiteSnippet?: string | null;
  // Campaign emails always link out via the {{CTA_LINK}} placeholder (check
  // 6). Cold-call follow-ups link straight to a real URL instead (meeting
  // link, booking page, or nothing for a "not ready yet" email) — so that
  // check doesn't apply there.
  requireCtaPlaceholder?: boolean;
  // A MEETING_BOOKED cold-call follow-up (see STEP 3 case A in
  // app/api/generate-email/route.ts) has a fixed structure with no CTA at
  // all — the meeting is already booked, so the email just confirms the
  // [MEETING LINK] (in its own paragraph, not last) and closes with a fixed
  // logistics line ("Shouldn't take more than 20-30 minutes..."). Checks 3
  // and 6 as written assume every email ends with CTA-then-closing, which
  // doesn't apply here and was flagging every meeting-confirmation email as
  // held for a structure problem that isn't actually one.
  meetingAlreadyBooked?: boolean;
  // The new fixed sequence templates (lib/emailTemplates.ts) end on a plain
  // question ("Worth a conversation?") with no CTA link, no booking link,
  // and no case-studies link anywhere — a deliberately different shape from
  // the old "AI writes the pitch, a fixed CTA block gets appended after"
  // structure the checks below were built around. Without this flag, checks
  // 3/6/7 would fail every one of these on a missing CTA/wrong length, which
  // isn't a real problem here — the whole body is a fixed, pre-approved
  // template, so only the AI-filled fragments (job type, name) matter.
  fixedTemplateNoCta?: boolean;
}

export interface EmailQualityVerdict {
  verdict: "approved" | "rejected";
  mechanicalFails: string[];
  judgmentFlags: string[];
  reasoning: string;
}

// Mirrors "01 Rulebook/(C) Email Checklist.md" in the LS Growth Email
// Outreach Obsidian project — if the rules diverge, fix both the same
// session, they're not allowed to drift apart.
const QUALITY_CHECK_SYSTEM_PROMPT = `You are the quality gate for Lucky's cold outreach emails at LS Growth. You do not write emails, you check ones that were already generated and decide if they're safe to send automatically, with no human reading them first.

Check the email against every item below. Be strict: this email will go out with nobody reading it if you approve it.

The ONLY case studies, client names, dollar figures, or numeric result claims allowed anywhere in the email are these exact sentences (a proof point may be split across a sentence boundary but every number/name in it must come from one of these):
{{ALLOWED_PROOF_SENTENCES}}
The only business/client names ever allowed to appear are: {{ALLOWED_CASE_STUDY_NAMES}}. Any other named business, or any dollar figure, percentage, or count of jobs/leads that isn't part of one of the sentences above (this includes an old, retired case study you might recall called "Cooper Electrical" or a "$300,000" or "Queenstown Cleaning" claim — those are NOT allowed here anymore, treat any appearance of them as invented) is always a fail, no exceptions.
Check 13 (nothing invented) is about facts specific to THIS lead's business — a made-up detail about them, their team, their location, something they supposedly said. It is NOT about the proof sentences above, which are always fair game to cite verbatim — BUT any narrative flourish added on top of one of them (a "before" state, a location, an explanation of how/why it happened) that isn't literally part of the given sentence IS a check 13 fail, same as an invented detail about the lead's own business.

MECHANICAL CHECKS (objective, no judgment call):
1. No dash of any kind anywhere, in the subject or the body — this includes plain hyphens used as punctuation, not just em/en dashes
2. The first <p> in the body is a greeting only: "Hey [Name]," if a real name was given, otherwise "Hi," — never "Hey there,"
3. {{STRUCTURE_CHECK}}
4. Contains none of: "hope this finds you well", "just checking in", "touching base", "circling back", "I wanted to reach out", "I'd love to connect", "don't hesitate to reach out"
5. Contains none of: "automated SMS", "AI voice call", "30-second response", "follow-up sequence", "Meta ads", "done-for-you system", "our system", "our platform", "our process", "we built"
6. {{CTA_CHECK}}
7. {{LENGTH_CHECK}}
15. No exclamation mark anywhere, subject or body
16. No named business or client anywhere other than {{ALLOWED_CASE_STUDY_NAMES}} — any other name (invented or real) is an automatic fail
17. No dollar figure, percentage, or numeric result claim anywhere other than what's inside the allowed proof sentences listed above
18. If the email contains the Perl Electrical proof line, every job type listed in it must be one of: heat pumps, solar, switchboard upgrades — any other job type named inside that specific sentence is a fail (job types named elsewhere in the email, outside that sentence, are fine)

JUDGMENT CHECKS (read it like the business owner would):
8. Opening paragraph is about THEM, not "I" or Lucky
9. References at least one specific, real detail from the notes/research given below, not just "trade business in [location]"
10. Names the actual job type(s) they do, not a generic "more work" or "more jobs"
11. If a proof point is used, it actually fits their trade
12. Sounds like a person texting, not a brand — no corporate phrasing
13. Nothing invented — no fact, name, or detail that isn't in the notes/research/website given below (other than the allowed proof sentences, which are always fine to cite). This is one of the most important checks: if the email confidently states something specific that wasn't given to you, that is always a judgment fail, no exceptions.
14. This must be a real pitch, never a declination. Automatic reject if the email discusses whether the lead is a fit for LS Growth, recommends skipping/not sending, says sending it would hurt credibility, or is otherwise addressed to a reviewer deciding whether to send rather than to the lead being pitched. A real generation bug already produced and sent emails like this (subject "not a fit", body explaining why the business shouldn't be emailed) — this check exists specifically to catch that failure mode before it reaches a real inbox again.
19. Nothing about this email reads as a fabricated or unverifiable claim about LS Growth's own track record beyond the allowed proof sentences — if you're unsure whether a results claim is one of the allowed sentences or a close paraphrase of a retired one, treat it as a fail rather than letting it through.

Your entire response must be a single JSON object and nothing else — no checklist walkthrough, no numbered notes, no "Let me work through this", no text before or after it. The first character of your response must be "{". Do all 19 checks in your head; none of that thinking appears in the output, only the final result:
{"verdict": "approved" or "rejected", "mechanical_fails": ["..."], "judgment_flags": ["..."], "reasoning": "one or two sentences on the overall call"}

"verdict" is the single source of truth — the caller uses ONLY this field to decide approved vs rejected, nothing else. Make your final decision on verdict deliberately, as the very last thing you decide, after all your thinking is done.

mechanical_fails and judgment_flags are supporting detail for a human glancing at a held email, not the decision itself:
- Only include an entry for a check that actually fails. Don't add an entry just to note a check passed, and don't leave stray "wait, reconsidering" or "actually this passes" narration in an entry — if your own text ends up concluding a check passes, that check doesn't belong in the array at all, whether or not you also flip verdict for it.
- An entry is a single flat sentence stating what failed and the exact text that failed it — never a transcript of you deciding. Banned in entry text, no exceptions: "wait", "actually", "re-checking", "re-reading", "let me", "hold on", "so this passes", "this passes" — if you notice yourself about to write any of those words, that means the check passed: stop, do not add an entry, do not describe the hesitation.
- Good entry: "Check 1: em dash in subject line ('more jobs — without more admin')." Bad entry (never do this): "Check 1: em dash used... wait, re-checking, actually that's just a hyphen, so this passes."
- It's possible (and fine) for both arrays to be empty while verdict is still "rejected" if the real issue doesn't cleanly map to one of the 13 numbered checks — reasoning should explain why in that case.
- Both arrays empty and verdict "approved" should be the normal, common outcome for a well-written email — don't pad the arrays out of caution.`;

export async function checkEmailQuality(input: EmailQualityInput): Promise<EmailQualityVerdict> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });

  const ctaCheck = input.fixedTemplateNoCta
    ? "Not applicable — this is a fixed, pre-approved template that deliberately ends on a plain question with no CTA link, booking link, or case-studies link anywhere in it. Never fail this check for a missing CTA here."
    : input.meetingAlreadyBooked
    ? "Not applicable — a meeting is already booked for this lead, so there is no separate call to action. Never fail this check for a missing CTA link on a meeting-confirmation email."
    : input.requireCtaPlaceholder === false
    ? "The second-to-last <p> is a real call to action (a real link or a clear next step), not a passive close"
    : `Not applicable — a fixed block with a case-studies link and a booking link is appended automatically after this content, the AI-written part you're checking should NOT contain {{CTA_LINK}}, a booking link, or a link to the main website at all. Never fail this check (or flag it as a missing CTA) just because the content you're given ends after the closing line with no link in it — that's correct.`;
  const structureCheck = input.fixedTemplateNoCta
    ? `This is a fixed, pre-approved template — do not evaluate its structure or paragraph order at all, that's already correct by construction. Only check whether the job type / matched job types / name filled into it (visible in the body) look like real, sane values, not something obviously wrong or invented.`
    : input.meetingAlreadyBooked
    ? `A meeting is already booked, so there is no CTA to sequence. Instead: somewhere in the body there is a paragraph containing exactly "[MEETING LINK]" and nothing else, and the fixed logistics line (e.g. "Shouldn't take more than 20-30 minutes. If anything comes up and you need to shift the time, just flick me a text.") appears once the body is otherwise done. It's fine, and common, for one short natural closing line (e.g. "Looking forward to our chat.") to come immediately after that logistics line as the true LAST <p> — that's not a structure failure, just a warmer close. Only fail this check if something substantive (a new topic, another CTA, an unrelated paragraph) comes after the logistics line, not for a one-line closing.`
    : input.requireCtaPlaceholder === false
    ? `The LAST <p> (before the sign-off) is a one-sentence closing line, e.g. "Looking forward to hearing from you." — the second-to-last <p> is the CTA line (check 6), and the closing line always comes after it`
    : `The LAST <p> (before the sign-off) is a one-sentence closing line, e.g. "Looking forward to hearing from you." This email should NOT contain a CTA paragraph at all — the booking and case-studies links are appended automatically after this content, so the closing line is correctly the very last thing in what you're checking.`;
  const lengthCheck = input.fixedTemplateNoCta
    ? `Not applicable — this is a fixed-length pre-approved template, not AI-authored prose. Never fail this check here.`
    : input.meetingAlreadyBooked
    ? `Not applicable — this is a fixed-format meeting confirmation (greeting, meeting time + link, one paragraph on their specific situation, then the fixed logistics line), not a length-flexible follow-up. Never fail this check for a meeting-confirmation email's length.`
    : "Length in range: initial email 4-6 sentences, follow-ups 2-4 sentences";
  const system = QUALITY_CHECK_SYSTEM_PROMPT
    .replace("{{CTA_CHECK}}", ctaCheck)
    .replace("{{STRUCTURE_CHECK}}", structureCheck)
    .replace("{{LENGTH_CHECK}}", lengthCheck)
    .replace("{{ALLOWED_PROOF_SENTENCES}}", ALLOWED_PROOF_SENTENCES.map((s) => `- "${s}"`).join("\n"))
    .replace(/\{\{ALLOWED_CASE_STUDY_NAMES\}\}/g, ALLOWED_CASE_STUDY_NAMES.join(" or "));

  const knownInfo = [
    realName(input.contactName) ? `- Contact name given: ${realName(input.contactName)}` : "- No contact name was given",
    input.personalizationHook?.trim() ? `- Research hook: ${input.personalizationHook.trim()}` : "",
    input.notes?.trim() ? `- Call notes: ${input.notes.trim()}` : "",
    input.websiteSnippet?.trim()
      ? `- Real text scraped from their website:\n${input.websiteSnippet.trim()}`
      : input.website?.trim() ? `- Website: ${input.website.trim()} (content could not be fetched for this check — do not assume anything specific about it)` : "",
  ].filter(Boolean).join("\n");

  const userPrompt = `Email step: ${input.step}

What was actually known about this business when the email was generated (use this to judge check 13 — anything specific in the email that ISN'T here is invented):
${knownInfo}

Subject: ${input.subject}

Body (HTML):
${input.bodyHtml}`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    // 1024 was too tight — a real production response got cut off mid-string
    // (multiple long judgment_flags entries plus reasoning exceeded it),
    // which breaks JSON parsing and the lead just errors out instead of
    // getting a real verdict. Doubled for headroom.
    max_tokens: 2048,
    temperature: 0,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<{ verdict?: string; mechanical_fails?: string[]; judgment_flags?: string[]; reasoning?: string }>(block.text);

  // Despite explicit instructions, the model sometimes narrates its own
  // back-and-forth inside an array entry ("wait, re-checking... actually
  // this passes") in ways too varied to reliably pattern-match — so the
  // verdict is no longer derived from array emptiness at all. The model
  // states verdict explicitly as its final, deliberate decision, and that's
  // the only thing the caller trusts. If it's ever missing or malformed
  // (old cached response, model slip), fall back to the array-emptiness
  // heuristic rather than silently approving something.
  const mechanicalFails = parsed.mechanical_fails || [];
  const judgmentFlags = parsed.judgment_flags || [];
  const verdict: "approved" | "rejected" =
    parsed.verdict === "approved" || parsed.verdict === "rejected"
      ? parsed.verdict
      : mechanicalFails.length === 0 && judgmentFlags.length === 0 ? "approved" : "rejected";

  return {
    verdict,
    mechanicalFails,
    judgmentFlags,
    reasoning: parsed.reasoning || "",
  };
}

// A second, independent opinion after checkEmailQuality approves — not
// another pass through the same 13/14-item checklist (which already missed
// 4 real emails whose entire content was the AI explaining why it shouldn't
// send to that lead, one of which literally said "sending this is likely to
// damage credibility" and still got approved and sent). This asks a
// completely different question with a fresh, un-checklisted prompt: would
// an ordinary person reading this once, cold, think "wait, this doesn't make
// sense to send"? Deliberately loose and holistic instead of itemized, so it
// isn't blind to the same failure shapes as the structured gate.
const COMMON_SENSE_SYSTEM_PROMPT = `You are the very last human-judgment check before this email goes out to a real business owner with nobody else reading it first. A structured quality checklist already approved it — your job isn't to re-run that checklist, it's to read the email once, the way a busy, slightly suspicious business owner would when it lands in their inbox, and catch anything a checklist could miss.

Flag it if any of this is true:
- It reads like a note written ABOUT the recipient for someone else to review, not a message TO them (e.g. it discusses whether they're a good fit, recommends skipping them, evaluates whether sending is a good idea, or refers to them in a way a real cold email never would)
- It says or implies anything that would confuse, offend, or make the recipient think "did I get this by mistake?"
- It contains a claim, tone, or logic that's actually broken or self-contradictory, not just imperfect style
- Your honest gut reaction is "a real person would never actually hit send on this"

Do NOT flag normal cold-outreach imperfections: a proof point that feels a bit salesy, a slightly generic opener, anything that's just not your personal writing style. This is a coarse safety net for genuine mistakes, not a rewrite request — only flag something you're confident a real recipient would immediately notice as wrong.

Respond with ONLY a JSON object, no other text:
{"ok": true or false, "reason": "one sentence, only if ok is false"}`;

export interface CommonSenseInput {
  subject: string;
  bodyHtml: string;
  company: string;
}

export async function checkCommonSense(input: CommonSenseInput): Promise<{ ok: boolean; reason?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    temperature: 0,
    system: COMMON_SENSE_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `This email is addressed to: ${input.company}\n\nSubject: ${input.subject}\n\nBody (HTML):\n${input.bodyHtml}`,
    }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<{ ok?: boolean; reason?: string }>(block.text);
  return { ok: parsed.ok !== false, reason: parsed.reason };
}

export interface PersonalizationHookInput {
  company: string;
  trade: string;
  location: string;
  website: string | null;
  facebook: string | null;
  notes: string | null;
}

const PERSONALIZATION_SYSTEM_PROMPT = `You research a business for Lucky from LS Growth, a company that runs done-for-you lead generation (ads, follow up, booking) for trade businesses in NZ and Australia, before he emails them cold.

You'll be given a business's name, trade, location, and what's known about their online presence — sometimes including real scraped text from their actual website. Your job:

0. If no website text and no notes were given below, use the web_search tool before writing anything — search for the business by name plus location (and trade if the name alone is ambiguous) to find their actual Facebook page, Google Business/Maps listing, or any other real public presence. Do this before falling back to a generic "no website" line — a found Facebook page or listing is always better than nothing, and "genuinely nothing findable at all" should be rare once you've actually searched, not the default. If multiple businesses share a similar name, use the location and trade to confirm you found the right one — do not use anything from a business you're not confident is this one.

1. Write exactly ONE short sentence that replaces a generic line like "I came across {company} and wanted to see if something similar could work for a {trade} business in {location}":
   - If real website text is provided, reference something TRUE and SPECIFIC from it (a service they offer, area they cover, something distinctive) — this is by far the best source, prefer it over anything else
   - Otherwise if your search found a real Facebook page, Google listing, or other online presence, reference something TRUE and SPECIFIC from that instead (what it says they do, reviews mentioning specific work, their coverage area) — same bar as website text, only use what you actually found
   - Otherwise if you searched and found nothing but confirmed they have no real online presence: point out that's costing them search traffic to competitors who do have one
   - Otherwise if they have a Facebook page but no website: note the mismatch (decent social presence, but missing from Google searches)
   - Otherwise if they have both a website and Facebook with no scraped text: just note you came across their business while looking at {trade} companies in {location}, naturally
   - If real notes are provided (e.g. from a call), reference the most specific detail from them instead
   - Never invent a detail that isn't actually given to you or actually found via search — an unverified guess is worse than the generic fallback line
   - Sound like a real person noticed something, not a sales tool — casual, no corporate phrases, no dashes or em dashes
   - No greeting, sign-off, or call to action — just the one sentence

2. Try to find the owner's first name using these sources in order of priority:
   a. If the scraped website text or search results clearly name a real person as the owner, founder, or main contact (e.g. "Owner: John Smith", "Run by Sarah and her team", a bio with a name) — extract their first name
   b. If the business name itself is person-named (e.g. "Mike's Electrical", "Sarah's Cleaning", "Dave Johnson Plumbing", "Tom & Sons Builders") — extract that first name
   c. Otherwise return null — never guess or invent a name that isn't clearly there

After any searching is done, respond with ONLY a JSON object as your final message, no markdown fences, no other text: {"sentence": "...", "contact_name": "John" or null}`;

export async function generatePersonalizationHook(input: PersonalizationHookInput): Promise<{ hook: string; contactName: string | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });

  const websiteSnippet = input.website ? await fetchWebsiteSnippet(input.website) : "";
  const canSearch = !websiteSnippet && !input.notes?.trim();

  const userPrompt = `Business: ${input.company}
Trade: ${input.trade || "unknown"}
Location: ${input.location || "unknown"}
Website: ${input.website || "none found"}
Facebook: ${input.facebook || "none found"}
Notes: ${input.notes || "none"}
${websiteSnippet ? `\nReal text scraped from their website:\n${websiteSnippet}` : ""}
${canSearch ? "\nNo website text or notes are available — search the web for this business before writing the sentence (see step 0)." : ""}`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: withWritingStyle(PERSONALIZATION_SYSTEM_PROMPT),
    messages: [{ role: "user", content: userPrompt }],
    ...(canSearch ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 } as const] } : {}),
  });

  // With web search enabled, content can interleave search-related blocks
  // with text — the final JSON is written as the last text block, not
  // necessarily content[0], so every text block needs to be joined in order.
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<{ sentence?: string; contact_name?: string | null }>(text);
  if (!parsed.sentence) throw new Error("AI response missing sentence");

  return { hook: validateHook(parsed.sentence), contactName: parsed.contact_name?.trim() || null };
}

// Guards against the model refusing (e.g. when call notes say the lead asked
// not to be contacted again) and returning a multi-paragraph explanation
// instead of a sentence. That text must never reach a live email — better to
// throw here and let the caller fall back to the generic line.
function validateHook(text: string): string {
  const tooLong = text.length > 280;
  const multiLine = text.includes("\n");
  const soundsLikeRefusal = /\b(i can't|i cannot|in good conscience|as an ai|i'm not able to|i won't)\b/i.test(text);
  if (tooLong || multiLine || soundsLikeRefusal) {
    throw new Error(`Personalization hook failed validation, discarding: ${text.slice(0, 120)}`);
  }
  return text;
}

export interface LeadDetailsInput {
  company: string;
  trade: string;
  location: string;
  website: string | null;
  facebook: string | null;
  notes: string | null;
}

export interface LeadDetailsResult {
  phone: string | null;
  email: string | null;
  website: string | null;
  facebook: string | null;
  contactName: string | null;
}

const LEAD_DETAILS_SYSTEM_PROMPT = `You find real contact details for a trade business for Lucky, who runs LS Growth, a lead generation agency in NZ. He's about to call this business and wants their actual phone number, email, website and owner's name if any of it is missing.

You'll be given the business name, trade, location, and whatever is already known. Use the web_search tool to search for the business by name plus location (add the trade if the name is ambiguous) and find their real Google Business listing, website, or Facebook page.

Only report details you actually found from a source you're confident is this specific business, not a similarly-named one elsewhere. If multiple businesses share a name, use location and trade to confirm before reporting anything from that source. Never invent or guess a phone number, email, or name, an unfound field must be null, not a guess.

Respond with ONLY a JSON object as your final message, no markdown fences, no other text:
{"phone": "" or null, "email": "" or null, "website": "" or null, "facebook": "" or null, "contactName": "" or null}`;

export async function findLeadContactDetails(input: LeadDetailsInput): Promise<LeadDetailsResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });

  const userPrompt = `Business: ${input.company}
Trade: ${input.trade || "unknown"}
Location: ${input.location || "unknown"}
Already known — website: ${input.website || "none"}, facebook: ${input.facebook || "none"}
Notes on file: ${input.notes || "none"}

Search for this business and find whichever of phone, email, website, facebook, and owner's first name are still missing above.`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: LEAD_DETAILS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 } as const],
  });

  // With web search enabled, content interleaves search blocks with text —
  // the final JSON is the last text block, not necessarily content[0].
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<Partial<LeadDetailsResult>>(text);

  return {
    phone: parsed.phone?.trim() || null,
    email: parsed.email?.trim() || null,
    website: parsed.website?.trim() || null,
    facebook: parsed.facebook?.trim() || null,
    contactName: parsed.contactName?.trim() || null,
  };
}

export interface ColdCallPrepInput {
  company: string;
  trade: string;
  location: string;
  website: string | null;
  facebook: string | null;
}

const COLD_CALL_PREP_SYSTEM_PROMPT = `You write short prep notes for Lucky from LS Growth, who runs done-for-you lead generation (ads, follow-up, booking) for trade businesses in NZ, right before he cold-calls a business.

You'll be given a business name, trade, location, and what's known about their online presence (website, Facebook). Write 2-4 short bullet lines (each starting with "- ") that Lucky can glance at right before dialing:
- One line of genuine trade-specific context: a real, well-known pain point or opportunity for that trade (e.g. seasonal demand swings, high average job value, how they currently get most jobs — word of mouth/referral vs ads, why a steady lead pipeline matters for that trade specifically). Make it specific to the trade, not generic "every business needs marketing" filler.
- One line on this business's specific web presence gap (no website = losing search traffic to competitors who rank; has Facebook but no website = inconsistent online presence; has both = low priority, skip this line or note they at least have presence to build on)
- Optionally one line suggesting a natural opening question or angle for the call based on the above

Rules:
- Plain bullet lines only, no headers, no greeting, no sign-off
- Casual, direct, written for Lucky to skim in 5 seconds, not corporate
- No dashes within a line (only the leading "- " bullet marker), no em dashes
- Do not invent specific facts about this exact business beyond the website/Facebook presence given

Respond with ONLY the bullet lines, no other text.`;

export async function generateColdCallPrep(input: ColdCallPrepInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });

  const userPrompt = `Business: ${input.company}
Trade: ${input.trade || "unknown"}
Location: ${input.location || "unknown"}
Website: ${input.website || "none found"}
Facebook: ${input.facebook || "none found"}`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: COLD_CALL_PREP_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");
  return block.text.trim();
}

export interface MeetingConfirmationInput {
  company: string;
  contactName: string;
  meetingTime: string;
}

const MEETING_SYSTEM_PROMPT = `You are writing a short meeting confirmation email on behalf of Lucky from LS Growth Agency, which runs Meta ad campaigns for trade businesses (cleaners, builders, plumbers, etc) to generate leads.

A lead just booked a quick call with Lucky through his booking page. There is NO prior conversation — Lucky has never spoken to this person before. Do NOT invent any prior context, price figures, objections, or anything discussed previously. There is nothing to reference.

Write a short, casual confirmation email:
- Address them by name at the start (e.g. "Hey Mike,")
- Confirm the day/time of the call and include the meeting link paragraph
- One light sentence about what the call covers: just a quick chat about their lead flow and how LS Growth works
- Include a paragraph containing exactly "[MEETING LINK]" and nothing else, on its own line with no other text
- Offer to shift the time by text if needed
- 2-3 short paragraphs max, nothing else
- No invented price figures, no objection handling, no assumed past conversations
- No dashes or em dashes anywhere
- No sign-off (added separately)
- HTML: only <p> and <a> tags, nothing else

Also write a short subject line (4-7 words) referencing the day/time, e.g. "Catch-up Wednesday 3:30pm, link inside".

Respond with ONLY a JSON object, no markdown fences, no other text:
{"subject": "...", "bodyHtml": "..."}`;

export async function generateMeetingConfirmationEmail(input: MeetingConfirmationInput): Promise<PersonalizedEmail> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });

  const userPrompt = `Company: ${input.company}
Contact name: ${realName(input.contactName) || "unknown"}
Meeting time: ${input.meetingTime}`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: withWritingStyle(MEETING_SYSTEM_PROMPT),
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  const jsonMatch = block.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Could not find JSON in AI response: ${block.text.slice(0, 200)}`);

  let parsed: { subject?: string; bodyHtml?: string };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(`Could not parse AI response as JSON: ${block.text.slice(0, 200)}`);
  }

  if (!parsed.subject || !parsed.bodyHtml) {
    throw new Error("AI response missing subject or bodyHtml");
  }

  return { subject: parsed.subject, bodyHtml: parsed.bodyHtml };
}

export interface MeetingTouchpointInput {
  company: string;
  contactName: string;
  meetingTime: string;
}

async function runMeetingEmailPrompt(systemPrompt: string, userPrompt: string): Promise<PersonalizedEmail> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: withWritingStyle(systemPrompt),
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  const jsonMatch = block.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Could not find JSON in AI response: ${block.text.slice(0, 200)}`);

  let parsed: { subject?: string; bodyHtml?: string };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(`Could not parse AI response as JSON: ${block.text.slice(0, 200)}`);
  }

  if (!parsed.subject || !parsed.bodyHtml) {
    throw new Error("AI response missing subject or bodyHtml");
  }

  return { subject: parsed.subject, bodyHtml: parsed.bodyHtml };
}

const VALUE_TOUCHPOINT_SYSTEM_PROMPT = `You are writing a short "value" touchpoint email on behalf of Lucky from LS Growth Agency, which runs Meta ad campaigns for trade businesses (cleaners, builders, plumbers, etc) to generate leads.

This lead has ALREADY booked a call with Lucky for later this week. This email is NOT a reminder about the call logistics, it's sent a few days beforehand purely to stay top of mind and give them one genuinely useful, specific tip about generating or converting leads for their trade, so the call doesn't feel like the first contact in a week.

Write a short, casual email:
- Address them by name at the start (e.g. "Hey Mike,")
- Give ONE concrete, specific, useful tip related to getting more leads or booking more jobs (e.g. speed to lead, follow-up cadence, review requests, seasonal demand), make it feel like genuine advice, not a pitch
- Briefly mention the upcoming call ahead of time (day/time), so they're reminded it's coming, but keep this to one line
- No invented case studies, stats, or client names
- 2-3 short paragraphs max
- No dashes or em dashes anywhere
- No sign-off (added separately)
- HTML: only <p> and <a> tags, nothing else

Also write a short subject line (4-7 words) that's about the tip, not "reminder" or "upcoming call".

Respond with ONLY a JSON object, no markdown fences, no other text:
{"subject": "...", "bodyHtml": "..."}`;

export async function generateValueTouchpointEmail(input: MeetingTouchpointInput): Promise<PersonalizedEmail> {
  const userPrompt = `Company: ${input.company}
Contact name: ${realName(input.contactName) || "unknown"}
Meeting time: ${input.meetingTime}`;
  return runMeetingEmailPrompt(VALUE_TOUCHPOINT_SYSTEM_PROMPT, userPrompt);
}

// This used to be AI-generated (see git history) but a same-day reminder
// doesn't need to be "anything crazy" — a fixed, simple template every time
// is exactly what was asked for, and it's faster and cheaper than an AI call
// for something this mechanical. Kept as a plain function (not
// runMeetingEmailPrompt) since there's no generation step at all.
export async function generateMeetingDayReminderEmail(input: MeetingTouchpointInput): Promise<PersonalizedEmail> {
  const name = realName(input.contactName) || "there";
  const subject = `Quick reminder — our meeting today at ${input.meetingTime}`;
  const bodyHtml = [
    `<p>Hey ${name},</p>`,
    `<p>Just a reminder we have our meeting today at ${input.meetingTime}. Looking forward to chatting!</p>`,
    `<p>You can join here: [MEETING LINK]</p>`,
  ].join("\n");
  return { subject, bodyHtml };
}
