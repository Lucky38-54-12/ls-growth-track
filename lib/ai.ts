import Anthropic from "@anthropic-ai/sdk";
import { fetchWebsiteSnippet } from "./website";

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

export interface PersonalizedEmailInput {
  company: string;
  contactName: string;
  trade: string;
  location: string;
  callNotes: string;
  website?: string | null;
  personalizationHook?: string | null;
}

export interface PersonalizedEmail {
  subject: string;
  bodyHtml: string;
}

const SYSTEM_PROMPT = `You write cold outreach and follow-up emails for Lucky from LS Growth — a done-for-you lead generation agency for trade businesses in NZ and Australia.

THE PITCH IN ONE SENTENCE: LS Growth gets trade businesses more booked jobs. Not leads — booked, paid jobs. That is the only outcome that matters in these emails.

Key proof points — use EXACTLY the sentence given, word for word, changing only how it connects to the rest of your sentence. This is a rule that keeps getting broken in new ways (a "before" state, a location, "without adding stress", "not by working more hours"...) — the pattern is always the same: a clause added onto the fact that explains, contrasts, or characterizes HOW or WHY it happened. The fixed fact is a number and a timeframe, full stop:
- GOOD: "Cooper Electrical got $80k in booked jobs within 2 months."
- BAD (any of these shapes): "Cooper Electrical went from quiet to $80k...", "Cooper Electrical, another Wellington business, got $80k...", "Cooper Electrical got $80k... without adding stress to the owner", "Cooper Electrical got $80k... not by working more hours"
- The proof point sentence must end where the fixed fact ends. If you want to make a broader point about the lead's own situation (their hours, their location, their growth), say it in a SEPARATE sentence — never chained onto the Cooper Electrical sentence with a comma or "without"/"not by"/"by having"
- This year alone LS Growth has generated over $300,000 worth of booked work for trade businesses across NZ
- Queenstown Cleaning: 30 booked paying jobs in the first month at under $11 per lead
- Cooper Electrical: $80k in booked jobs within 2 months (no location, no "before" state, no mechanism, no trailing clause of any kind — just this number, full stop)

CRITICAL — SELL THE OUTCOME, NOT THE PROCESS:
- Never describe how LS Growth works. No "we built a system", no "automated SMS", no "AI voice call", no "30-second response", no "follow-up sequence", no "Meta ads", no "done-for-you system", no "lead gen system"
- The client does not care how it works — they care about getting more booked jobs and revenue
- Never say "we built", "we created", "we set up", "our system", "our platform", "our process"
- Describe only results: "more booked jobs", "a steady flow of [specific job type]", "consistent work coming in"

MAKE IT SPECIFIC TO THEIR ACTUAL BUSINESS:
- Use the research (website text, notes, personalization hook) to identify the specific types of jobs this business does (e.g. for an electrical company: heat pumps, switchboard upgrades, solar installs, LED lighting; for a cleaner: end-of-tenancy cleans, commercial cleaning, carpet cleaning)
- The email must reference the actual job types THEY do, not just their trade in general
- Match the specificity level of what you were actually given — if the research only says something vague like "residential or commercial electrical project" or "fault-finding to new builds", do NOT upgrade that into a specific invented list like "switchboard upgrades, EV charger installs". Only name a specific job type if it is close to verbatim in the research. When in doubt, quote closer to the source rather than sounding more specific than you actually know
- When using a proof point, pick the one that fits their trade closest. If no exact match, use the $300k figure which applies broadly
- Never use generic phrases like "more work" or "more jobs" alone — name the type of job where you know it
- If the personalization hook or research names one clear, concrete observation (e.g. "not active on Facebook like your competitors", "no website"), that specific observation IS the angle for this email — use it directly, don't soften it into something vaguer like "a gap between people finding you and jobs getting booked". A vague paraphrase of a specific fact defeats the purpose of having the fact

SUBJECT LINE
- Short, lowercase preferred, specific to this business or their problem
- Must look like it came from a real person, not a campaign
- If a real contact name is known, work it into the subject naturally (e.g. "quick one Dave", "work been quiet lately Dave")
- No dashes or em dashes in the subject line, same rule as the body
- BANNED SHAPE — never write a subject as "[Location] [trade]s + generic phrase" (e.g. "Wellington electricians on Facebook", "Wellington electricians leaving jobs on the table", "Wellington cleaners, 30 days in"). This exact shape has already been sent, nearly word-for-word, to multiple unrelated businesses in the same campaign — it reads as a mail-merge template with the trade swapped in, not a real person writing to this specific business, which is the one thing this email must never look like.
- When there's no specific research to draw from (see "Nothing specific is known" case below), anchor the subject on the company's actual name or a plain, personal-sounding line instead of a generic industry-wide phrase — "quick one for [Company]", "quick one", "the jobs slipping through" — never restate their trade + location as the hook, that's not specific to them, it's specific to their category
- Good: "the jobs slipping through", "quick one Dave", "switchboard upgrades and EV chargers" (only if those are their actual confirmed job types)
- Bad: "Grow your business", "More leads for [Company]", "Exciting opportunity", "Wellington electricians on Facebook", "Wellington cleaners, 30 days in"

GREETING (MANDATORY — never skip this)
- The very first <p> in body_html MUST be the greeting, nothing else in that paragraph
- If a real contact name is given: "Hey [Name]," (e.g. "Hey Dave,")
- The "Contact name" field below is sometimes "unknown" even though the real contact is actually named elsewhere — in the notes (e.g. notes ending "Notes: Conrad") or in the scraped website text (e.g. "Alistair — Director"). If you can clearly tell from either source who the real person is, treat that as the known name and greet them by it. Be consistent: if you use their name anywhere in the subject or body, the greeting must use it too, never "Hi," in that case
- If no name is known anywhere (not in the field, not the notes, not the website text): "Hi," — never "Hey there,", never jump straight into the message

OPENING
- First content paragraph (after the greeting) is always about THEM — their situation, something from their website, something from the call
- Never open with "I" — never "I wanted to reach out", "I came across your business", "My name is Lucky"

BODY
- Trade owners read email on their phone between jobs — get to the point in 2–3 sentences
- One idea per email, not everything LS Growth does
- Reference their specific situation: trade, location, what they said on the call
- Use a real proof point with numbers — specific beats vague every time
- Write like a person, not a sales tool
- body_html has exactly this many <p> tags, no more: greeting, opening, proof point/body (1-2 paragraphs), closing. There is no CTA paragraph — do not write a sentence anywhere proposing a call, a chat, "15 minutes", booking, or asking if they're interested. The pitch paragraph ends on the proof point or the outcome, full stop, then the very next <p> is the closing line

CLOSING (MANDATORY — the LAST <p> in body_html, before the signature)
- One short, natural closing line — nothing else in that paragraph. This is the last thing you write, and the paragraph immediately before it is the proof point/pitch, never a CTA.
- Match the tone: for initial and follow-up emails use "Looking forward to hearing from you." or "Happy to jump on a call whenever works." For breakup emails use "Wishing you all the best either way." Never use "Hope to hear from you soon" or "Don't hesitate to reach out"
- The signature (Cheers, Lucky, LS Growth) is added separately — do NOT include it in body_html
- Do NOT write a call-to-action sentence, a booking link, {{CTA_LINK}}, or a link to the main website yourself — a fixed block with a case-studies link and a booking link is appended automatically right after your closing line, so writing your own duplicates it

Example structure (order matters):
<p>Hey Dave,</p>
<p>[opening about them]</p>
<p>[proof point / body]</p>
<p>Looking forward to hearing from you.</p>

LENGTH
- Initial email: 4–6 sentences total. Every sentence earns its place.
- Follow-ups: 2–4 sentences max — shorter is better

NEVER USE
- "Hope this finds you well" / "hope you're keeping well"
- "Just checking in" / "touching base" / "circling back"
- "I wanted to reach out" / "I'd love to connect"
- "Don't hesitate to reach out"
- Dashes or em dashes anywhere, including the subject line
- "Hey there" under any circumstances
- Any mention of the process: automated SMS, AI voice call, 30-second response, follow-up sequence, Meta ads, done-for-you system
- Skipping the greeting — every email MUST open with "Hey [Name]," or "Hi,"
- Skipping the closing line — every email MUST end with a one-sentence close before the signature is added
- Writing your own call-to-action sentence anywhere ("worth a call", "15 minutes", "let's chat", "interested?") — there is no CTA paragraph in body_html, the closing line follows directly after the pitch/proof point

Signs off as: Lucky, LS Growth

NOT A FIT — DO NOT WRITE A "SORRY, NOT A FIT" EMAIL:
LS Growth's proof points and pitch only make sense for small trade/service businesses whose pipeline comes from Facebook/word-of-mouth/day-to-day residential or small-commercial jobs (electricians, plumbers, cleaners, builders, landscapers, etc). If the business given to you is clearly the wrong fit — a large corporate, a national utility or retailer, a wholesaler/distributor, a firm whose work visibly comes from tenders or developer relationships rather than day-to-day bookings, or anything obviously outside a small local trade business — do NOT write an email telling them they're not a fit. That is never a real outreach email; it is you refusing the task, and refusing must never look like a sent email. Instead respond with exactly this JSON shape and nothing else:
{"not_a_fit": true, "reason": "one sentence on why this business doesn't fit LS Growth's ICP"}
When in doubt and the business is a normal small/local trade business, write the email as normal — this escape hatch is only for the clear, obvious cases (a company like Meridian Energy or a 150-person tender-based contractor), not for ordinary businesses that are merely hard to research.

Respond with ONLY a JSON object, no markdown fences, no other text:
{"subject": "...", "body_html": "..."}

body_html: <p> tags only, no surrounding div, no signature paragraph (added separately), no pixel tags.`;

export async function generatePersonalizedEmail(input: PersonalizedEmailInput): Promise<PersonalizedEmail> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });

  const extraContext = [
    input.personalizationHook?.trim() ? `- Research hook: ${input.personalizationHook.trim()}` : "",
    input.website?.trim() ? `- Website: ${input.website.trim()}` : "",
  ].filter(Boolean).join("\n");

  const userPrompt = `Business: ${input.company}
Contact name: ${realName(input.contactName) || "unknown"}
Trade: ${input.trade || "unknown"}
Location: ${input.location || "unknown"}
${extraContext ? `\nWhat's known about this business:\n${extraContext}\n` : ""}
Call notes:
${input.callNotes}`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<{ subject?: string; body_html?: string }>(block.text);

  if (!parsed.subject || !parsed.body_html) {
    throw new Error("AI response missing subject or body_html");
  }

  return { subject: stripDashes(parsed.subject), bodyHtml: stripDashes(parsed.body_html) };
}

export interface CampaignStepEmailInput {
  company: string;
  contactName: string;
  trade: string;
  location: string;
  notes: string;
  website?: string | null;
  personalizationHook?: string | null;
  step: "initial" | "followup1" | "followup2" | "followup3" | "followup4" | "checkin";
  priorSubjects: string[];
  learnings?: string | null;
}

function learningsBlock(learnings: string | null | undefined): string {
  return learnings?.trim()
    ? `\n\nGuidance from past send performance (real opens/clicks/replies on previous emails) — apply where it genuinely fits this business, don't force it in:\n${learnings.trim()}`
    : "";
}

const STEP_GUIDANCE: Record<CampaignStepEmailInput["step"], string> = {
  initial: "FIRST EMAIL. Open with something specific about their business from research — the actual types of jobs they do (e.g. heat pump installs, switchboard upgrades, end-of-tenancy cleans — whatever their website or notes show). One sentence on the outcome they're missing out on: consistent booked jobs of that type coming in without relying on word of mouth. Drop one real proof point with numbers ($300k+ generated this year, or Queenstown Cleaning 30 booked jobs in a month, or Cooper Electrical $80k in 2 months — pick whichever fits the trade). End with a direct ask: grab a time, 15 minutes, this week. Total: 4–6 sentences. Never describe process or mechanism.",
  followup1: "SHORT BUMP — 2–3 sentences plus the CTA link, nothing more. Do NOT repeat the first email angle. Ask one direct question about their situation — e.g. whether they have enough [specific job type] coming in consistently, or whether they're relying on word of mouth for [their trade]. Reference their business by name. No filler, no 'just bumping this', no process talk.",
  followup2: "Third touch. Lead with a specific proof point and real numbers — use whichever fits their trade best: Queenstown Cleaning (30 booked paying jobs in the first month, under $11 per lead), Cooper Electrical ($80k in booked jobs in 2 months), or the $300k generated this year across NZ trade businesses. One sentence connecting it to the specific job types THEY do. Direct CTA. 3–4 sentences total. No process talk.",
  followup3: "Genuine scarcity angle — LS Growth works with one business per trade per area so the work stays exclusive. There is a spot open in their location right now. Reference their specific location and trade. Direct link. 3 sentences max, no fluff, no process talk.",
  followup4: "Breakup email. One sentence acknowledging you have reached out a few times, no guilt. One sentence that mirrors back what they actually do (the specific job types from their website/notes) — shows you were paying attention, not blasting. Leave the door genuinely open. Last line is the booking link. 3–4 sentences, warm but final. No process talk.",
  checkin: "Long gap since last touch — acknowledge it briefly without being awkward. Mention something seasonally relevant to their specific job types (summer demand for heat pumps, end-of-year switchboard upgrades, spring cleaning rush, etc.). One sentence on the outcome LS Growth gets for businesses like theirs. Direct CTA. 3 sentences. No mention of the sequence or process.",
};

export type NotAFitResult = { notAFit: true; reason: string; websiteSnippet: string };
export type CampaignStepEmailResult = (PersonalizedEmail & { notAFit?: false; websiteSnippet: string }) | NotAFitResult;

export async function generateCampaignStepEmail(input: CampaignStepEmailInput): Promise<CampaignStepEmailResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });

  const priorSubjectsBlock = input.priorSubjects.length
    ? `\n\nSubjects of emails already sent to this business (don't repeat these angles):\n${input.priorSubjects.map((s) => `- ${s}`).join("\n")}`
    : "";

  // The personalization_hook is just a one-sentence summary written earlier
  // (often at sheet-import time) — it rarely names actual job types. Fetch
  // the real website text fresh here so the model has something concrete to
  // draw specific services from instead of guessing plausible-sounding ones.
  const websiteSnippet = input.website?.trim() ? await fetchWebsiteSnippet(input.website.trim()) : "";

  const hasRealInfo = !!(input.notes?.trim() || input.personalizationHook?.trim() || websiteSnippet);
  const knownInfoBlock = hasRealInfo
    ? `\nWhat's actually known about this business (use this to make the email specific and prove you looked them up — don't just repeat it verbatim):
${input.personalizationHook?.trim() ? `- ${input.personalizationHook.trim()}\n` : ""}${input.notes?.trim() ? `- Notes: ${input.notes.trim()}\n` : ""}${websiteSnippet ? `- Real text scraped from their website:\n${websiteSnippet}\n` : input.website?.trim() ? `- Website: ${input.website.trim()} (could not fetch content — do not guess what's on it)\n` : ""}
Only name specific job types (e.g. "switchboard upgrades", "heat pump installs") if they're actually confirmed above, in the notes, or the scraped website text. If the trade's specific services aren't confirmed anywhere, describe their work in general trade terms instead (e.g. "the jobs you do", "your workload") rather than inventing a plausible-sounding list — an invented service is an automatic reject.`
    : `\nNothing specific is known about this business yet beyond their company name, trade, and location. Do NOT open with a generic industry statement like "When a homeowner needs a plumber..." or "Most trade businesses...". Do NOT invent details about them. Instead: open with Hi, (no name), introduce what LS Growth does for their trade in one sentence, drop one real proof point with numbers, then a direct CTA. Short, honest, no fluff. The subject line especially must not fall back on "[Location] [trade]s" — anchor it on their company name instead (e.g. "quick one for ${input.company}") since that's the only thing that's actually specific to them here.`;

  const userPrompt = `Business: ${input.company}
Contact name: ${realName(input.contactName) || "unknown"}
Trade: ${input.trade || "unknown"}
Location: ${input.location || "unknown"}
${knownInfoBlock}
${priorSubjectsBlock}

This email's purpose: ${STEP_GUIDANCE[input.step]}${learningsBlock(input.learnings)}`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<{ subject?: string; body_html?: string; not_a_fit?: boolean; reason?: string }>(block.text);

  if (parsed.not_a_fit) {
    return { notAFit: true, reason: parsed.reason || "AI flagged this lead as not a fit for LS Growth's ICP.", websiteSnippet };
  }

  if (!parsed.subject || !parsed.body_html) {
    throw new Error("AI response missing subject or body_html");
  }

  // Returned so the caller can pass the exact same scraped text into
  // checkEmailQuality() — without it, the quality gate has no way to verify
  // specific claims (job types, coverage area) against reality and defensively
  // flags anything specific as possibly invented, rejecting emails that were
  // actually grounded in real website content.
  return { subject: stripDashes(parsed.subject), bodyHtml: stripDashes(parsed.body_html), websiteSnippet };
}

export interface ReviseCampaignStepEmailInput extends CampaignStepEmailInput {
  priorSubject: string;
  priorBodyHtml: string;
  rejection: { mechanicalFails: string[]; judgmentFlags: string[]; reasoning: string };
}

// Used when a lead's last attempt at this step was held by the quality
// checker — feeds the exact rejected draft and the exact reasons back in, so
// the model fixes the specific problem instead of a blind reroll that has no
// better odds than the first attempt.
export async function reviseCampaignStepEmail(input: ReviseCampaignStepEmailInput): Promise<CampaignStepEmailResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });

  const websiteSnippet = input.website?.trim() ? await fetchWebsiteSnippet(input.website.trim()) : "";

  const hasRealInfo = !!(input.notes?.trim() || input.personalizationHook?.trim() || websiteSnippet);
  const knownInfoBlock = hasRealInfo
    ? `\nWhat's actually known about this business (use this to make the email specific and prove you looked them up — don't just repeat it verbatim):
${input.personalizationHook?.trim() ? `- ${input.personalizationHook.trim()}\n` : ""}${input.notes?.trim() ? `- Notes: ${input.notes.trim()}\n` : ""}${websiteSnippet ? `- Real text scraped from their website:\n${websiteSnippet}\n` : input.website?.trim() ? `- Website: ${input.website.trim()} (could not fetch content — do not guess what's on it)\n` : ""}
Only name specific job types (e.g. "switchboard upgrades", "heat pump installs") if they're actually confirmed above, in the notes, or the scraped website text. If the trade's specific services aren't confirmed anywhere, describe their work in general trade terms instead (e.g. "the jobs you do", "your workload") rather than inventing a plausible-sounding list — an invented service is an automatic reject.`
    : `\nNothing specific is known about this business yet beyond their company name, trade, and location.`;

  const rejectionBlock = [
    input.rejection.mechanicalFails.length ? `Mechanical fails:\n${input.rejection.mechanicalFails.map((f) => `- ${f}`).join("\n")}` : "",
    input.rejection.judgmentFlags.length ? `Judgment flags:\n${input.rejection.judgmentFlags.map((f) => `- ${f}`).join("\n")}` : "",
    input.rejection.reasoning ? `Reasoning: ${input.rejection.reasoning}` : "",
  ].filter(Boolean).join("\n\n");

  const userPrompt = `Business: ${input.company}
Contact name: ${realName(input.contactName) || "unknown"}
Trade: ${input.trade || "unknown"}
Location: ${input.location || "unknown"}
${knownInfoBlock}

This email's purpose: ${STEP_GUIDANCE[input.step]}${learningsBlock(input.learnings)}

This exact email was already generated and rejected by the quality checker. Fix ONLY the specific problems listed below — keep everything else about the email (angle, structure, proof point, length) the same wherever it isn't part of the problem. Do not rewrite from scratch unless the fails genuinely require it.

Rejected subject: ${input.priorSubject}
Rejected body:
${input.priorBodyHtml}

Why it was rejected:
${rejectionBlock}`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<{ subject?: string; body_html?: string; not_a_fit?: boolean; reason?: string }>(block.text);

  if (parsed.not_a_fit) {
    return { notAFit: true, reason: parsed.reason || "AI flagged this lead as not a fit for LS Growth's ICP.", websiteSnippet };
  }

  if (!parsed.subject || !parsed.body_html) {
    throw new Error("AI response missing subject or body_html");
  }

  return { subject: stripDashes(parsed.subject), bodyHtml: stripDashes(parsed.body_html), websiteSnippet };
}

export interface EmailQualityInput {
  subject: string;
  bodyHtml: string;
  step: CampaignStepEmailInput["step"] | "cold_call_followup";
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

These proof points are fixed, real, company-wide facts — always legitimate to use even if they don't appear in this specific lead's notes/research, so never flag one of these as invented:
- "This year alone LS Growth has generated over $300,000 worth of booked work for trade businesses across NZ"
- Queenstown Cleaning: 30 booked paying jobs in the first month at under $11 per lead
- Cooper Electrical: $80k in booked jobs within 2 months (no location or "before" state is part of this fact)
"Trade business" in these proof points is used loosely to mean any local service business Lucky's leads run (cleaners, sparkies, builders, plumbers, etc.) — don't flag that wording as a category mismatch.
Check 13 (nothing invented) is about facts specific to THIS lead's business — a made-up detail about them, their team, their location, something they supposedly said. It is NOT about the three proof points above, which are always fair game to cite — BUT if the email adds narrative flourish on top of a proof point that isn't part of the fixed fact (e.g. "Cooper Electrical went from quiet to $80k" — "quiet" is not part of the given fact, or attaching a city to Cooper Electrical), that added detail IS a check 13 fail, same as an invented detail about the lead's own business.

MECHANICAL CHECKS (objective, no judgment call):
1. No dash or em dash anywhere, in the subject or the body
2. The first <p> in the body is a greeting only: "Hey [Name]," if a real name was given, otherwise "Hi," — never "Hey there,"
3. {{STRUCTURE_CHECK}}
4. Contains none of: "hope this finds you well", "just checking in", "touching base", "circling back", "I wanted to reach out", "I'd love to connect", "don't hesitate to reach out"
5. Contains none of: "automated SMS", "AI voice call", "30-second response", "follow-up sequence", "Meta ads", "done-for-you system", "our system", "our platform", "our process", "we built"
6. {{CTA_CHECK}}
7. {{LENGTH_CHECK}}

JUDGMENT CHECKS (read it like the business owner would):
8. Opening paragraph is about THEM, not "I" or Lucky
9. References at least one specific, real detail from the notes/research given below, not just "trade business in [location]"
10. Names the actual job type(s) they do, not a generic "more work" or "more jobs"
11. If a proof point is used, it actually fits their trade
12. Sounds like a person texting, not a brand — no corporate phrasing
13. Nothing invented — no fact, name, or detail that isn't in the notes/research/website given below. This is the most important check: if the email confidently states something specific that wasn't given to you, that is always a judgment fail, no exceptions.
14. This must be a real pitch, never a declination. Automatic reject if the email discusses whether the lead is a fit for LS Growth, recommends skipping/not sending, says sending it would hurt credibility, or is otherwise addressed to a reviewer deciding whether to send rather than to the lead being pitched. A real generation bug already produced and sent emails like this (subject "not a fit", body explaining why the business shouldn't be emailed) — this check exists specifically to catch that failure mode before it reaches a real inbox again.

Your entire response must be a single JSON object and nothing else — no checklist walkthrough, no numbered notes, no "Let me work through this", no text before or after it. The first character of your response must be "{". Do all 13 checks in your head; none of that thinking appears in the output, only the final result:
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

  const ctaCheck = input.meetingAlreadyBooked
    ? "Not applicable — a meeting is already booked for this lead, so there is no separate call to action. Never fail this check for a missing CTA link on a meeting-confirmation email."
    : input.requireCtaPlaceholder === false
    ? "The second-to-last <p> is a real call to action (a real link or a clear next step), not a passive close"
    : `Not applicable — a fixed block with a case-studies link and a booking link is appended automatically after this content, the AI-written part you're checking should NOT contain {{CTA_LINK}}, a booking link, or a link to the main website at all. Never fail this check (or flag it as a missing CTA) just because the content you're given ends after the closing line with no link in it — that's correct.`;
  const structureCheck = input.meetingAlreadyBooked
    ? `A meeting is already booked, so there is no CTA to sequence. Instead: somewhere in the body there is a paragraph containing exactly "[MEETING LINK]" and nothing else, and the fixed logistics line (e.g. "Shouldn't take more than 20-30 minutes. If anything comes up and you need to shift the time, just flick me a text.") appears once the body is otherwise done. It's fine, and common, for one short natural closing line (e.g. "Looking forward to our chat.") to come immediately after that logistics line as the true LAST <p> — that's not a structure failure, just a warmer close. Only fail this check if something substantive (a new topic, another CTA, an unrelated paragraph) comes after the logistics line, not for a one-line closing.`
    : input.requireCtaPlaceholder === false
    ? `The LAST <p> (before the sign-off) is a one-sentence closing line, e.g. "Looking forward to hearing from you." — the second-to-last <p> is the CTA line (check 6), and the closing line always comes after it`
    : `The LAST <p> (before the sign-off) is a one-sentence closing line, e.g. "Looking forward to hearing from you." This email should NOT contain a CTA paragraph at all — the booking and case-studies links are appended automatically after this content, so the closing line is correctly the very last thing in what you're checking.`;
  const lengthCheck = input.meetingAlreadyBooked
    ? `Not applicable — this is a fixed-format meeting confirmation (greeting, meeting time + link, one paragraph on their specific situation, then the fixed logistics line), not a length-flexible follow-up. Never fail this check for a meeting-confirmation email's length.`
    : "Length in range: initial email 4-6 sentences, follow-ups 2-4 sentences";
  const system = QUALITY_CHECK_SYSTEM_PROMPT.replace("{{CTA_CHECK}}", ctaCheck).replace("{{STRUCTURE_CHECK}}", structureCheck).replace("{{LENGTH_CHECK}}", lengthCheck);

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
    system: PERSONALIZATION_SYSTEM_PROMPT,
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
    system: MEETING_SYSTEM_PROMPT,
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
    system: systemPrompt,
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
