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

// Models sometimes wrap JSON in ```json fences despite instructions not to —
// strip those, then fall back to grabbing the first {...} block, before
// giving up and letting the caller's catch handle a genuinely bad response.
function parseJsonResponse<T>(text: string): T {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Could not parse AI response as JSON: ${text.slice(0, 200)}`);
  }
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

Key proof points (use exactly what's stated — never add a location, timeframe, or detail that isn't written here):
- This year alone LS Growth has generated over $300,000 worth of booked work for trade businesses across NZ
- Queenstown Cleaning: 30 booked paying jobs in the first month at under $11 per lead
- Cooper Electrical: $80k in booked jobs within 2 months (no location is specified for Cooper Electrical — never call them "another Wellington business" or attach any city/region to them, even if the lead you're writing to is in that city)

CRITICAL — SELL THE OUTCOME, NOT THE PROCESS:
- Never describe how LS Growth works. No "we built a system", no "automated SMS", no "AI voice call", no "30-second response", no "follow-up sequence", no "Meta ads", no "done-for-you system", no "lead gen system"
- The client does not care how it works — they care about getting more booked jobs and revenue
- Never say "we built", "we created", "we set up", "our system", "our platform", "our process"
- Describe only results: "more booked jobs", "a steady flow of [specific job type]", "consistent work coming in"

MAKE IT SPECIFIC TO THEIR ACTUAL BUSINESS:
- Use the research (website text, notes, personalization hook) to identify the specific types of jobs this business does (e.g. for an electrical company: heat pumps, switchboard upgrades, solar installs, LED lighting; for a cleaner: end-of-tenancy cleans, commercial cleaning, carpet cleaning)
- The email must reference the actual job types THEY do, not just their trade in general
- When using a proof point, pick the one that fits their trade closest. If no exact match, use the $300k figure which applies broadly
- Never use generic phrases like "more work" or "more jobs" alone — name the type of job where you know it

SUBJECT LINE
- Short, lowercase preferred, specific to this business or their problem
- Must look like it came from a real person, not a campaign
- If a real contact name is known, work it into the subject naturally (e.g. "quick one Dave", "work been quiet lately Dave")
- No dashes or em dashes in the subject line, same rule as the body
- Good: "the jobs slipping through", "quick one Dave", "Wellington cleaners, 30 days in"
- Bad: "Grow your business", "More leads for [Company]", "Exciting opportunity"

GREETING (MANDATORY — never skip this)
- The very first <p> in body_html MUST be the greeting, nothing else in that paragraph
- If a real contact name is given: "Hey [Name]," (e.g. "Hey Dave,")
- The "Contact name" field below is sometimes "unknown" even though the notes actually name the real contact (e.g. notes ending "Notes: Conrad") — if you can clearly tell from the notes who the real person is, treat that as the known name and greet them by it. Be consistent: if you use their name anywhere in the subject or body, the greeting must use it too, never "Hi," in that case
- If no name is known anywhere (not in the field, not in the notes): "Hi," — never "Hey there,", never jump straight into the message

OPENING
- First content paragraph (after the greeting) is always about THEM — their situation, something from their website, something from the call
- Never open with "I" — never "I wanted to reach out", "I came across your business", "My name is Lucky"

BODY
- Trade owners read email on their phone between jobs — get to the point in 2–3 sentences
- One idea per email, not everything LS Growth does
- Reference their specific situation: trade, location, what they said on the call
- Use a real proof point with numbers — specific beats vague every time
- Write like a person, not a sales tool

CALL TO ACTION (MANDATORY — the second-to-last <p> in body_html)
- Direct and specific: "worth a 15 min call this week?" not "feel free to reach out anytime"
- Booking link woven in naturally: "grab a time here: {{CTA_LINK}}"

CLOSING (MANDATORY — the LAST <p> in body_html, after the CTA, before the signature)
- One short, natural closing line — nothing else in that paragraph
- Match the tone: for initial and follow-up emails use "Looking forward to hearing from you." or "Happy to jump on a call whenever works." For breakup emails use "Wishing you all the best either way." Never use "Hope to hear from you soon" or "Don't hesitate to reach out"
- The signature (Cheers, Lucky, LS Growth) is added separately — do NOT include it in body_html

Example structure (order matters):
<p>Hey Dave,</p>
<p>[opening about them]</p>
<p>[proof point / body]</p>
<p>Worth a 15 min call this week? Grab a time here: {{CTA_LINK}}</p>
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

Signs off as: Lucky, LS Growth

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

  return { subject: parsed.subject, bodyHtml: parsed.body_html };
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
}

const STEP_GUIDANCE: Record<CampaignStepEmailInput["step"], string> = {
  initial: "FIRST EMAIL. Open with something specific about their business from research — the actual types of jobs they do (e.g. heat pump installs, switchboard upgrades, end-of-tenancy cleans — whatever their website or notes show). One sentence on the outcome they're missing out on: consistent booked jobs of that type coming in without relying on word of mouth. Drop one real proof point with numbers ($300k+ generated this year, or Queenstown Cleaning 30 booked jobs in a month, or Cooper Electrical $80k in 2 months — pick whichever fits the trade). End with a direct ask: grab a time, 15 minutes, this week. Total: 4–6 sentences. Never describe process or mechanism.",
  followup1: "SHORT BUMP — 2–3 sentences plus the CTA link, nothing more. Do NOT repeat the first email angle. Ask one direct question about their situation — e.g. whether they have enough [specific job type] coming in consistently, or whether they're relying on word of mouth for [their trade]. Reference their business by name. No filler, no 'just bumping this', no process talk.",
  followup2: "Third touch. Lead with a specific proof point and real numbers — use whichever fits their trade best: Queenstown Cleaning (30 booked paying jobs in the first month, under $11 per lead), Cooper Electrical ($80k in booked jobs in 2 months), or the $300k generated this year across NZ trade businesses. One sentence connecting it to the specific job types THEY do. Direct CTA. 3–4 sentences total. No process talk.",
  followup3: "Genuine scarcity angle — LS Growth works with one business per trade per area so the work stays exclusive. There is a spot open in their location right now. Reference their specific location and trade. Direct link. 3 sentences max, no fluff, no process talk.",
  followup4: "Breakup email. One sentence acknowledging you have reached out a few times, no guilt. One sentence that mirrors back what they actually do (the specific job types from their website/notes) — shows you were paying attention, not blasting. Leave the door genuinely open. Last line is the booking link. 3–4 sentences, warm but final. No process talk.",
  checkin: "Long gap since last touch — acknowledge it briefly without being awkward. Mention something seasonally relevant to their specific job types (summer demand for heat pumps, end-of-year switchboard upgrades, spring cleaning rush, etc.). One sentence on the outcome LS Growth gets for businesses like theirs. Direct CTA. 3 sentences. No mention of the sequence or process.",
};

export async function generateCampaignStepEmail(input: CampaignStepEmailInput): Promise<PersonalizedEmail & { websiteSnippet: string }> {
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
    : `\nNothing specific is known about this business yet beyond their company name, trade, and location. Do NOT open with a generic industry statement like "When a homeowner needs a plumber..." or "Most trade businesses...". Do NOT invent details about them. Instead: open with Hi, (no name), introduce what LS Growth does for their trade in one sentence, drop one real proof point with numbers, then a direct CTA. Short, honest, no fluff.`;

  const userPrompt = `Business: ${input.company}
Contact name: ${realName(input.contactName) || "unknown"}
Trade: ${input.trade || "unknown"}
Location: ${input.location || "unknown"}
${knownInfoBlock}
${priorSubjectsBlock}

This email's purpose: ${STEP_GUIDANCE[input.step]}`;

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

  // Returned so the caller can pass the exact same scraped text into
  // checkEmailQuality() — without it, the quality gate has no way to verify
  // specific claims (job types, coverage area) against reality and defensively
  // flags anything specific as possibly invented, rejecting emails that were
  // actually grounded in real website content.
  return { subject: parsed.subject, bodyHtml: parsed.body_html, websiteSnippet };
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
- Cooper Electrical: $80k in booked jobs within 2 months
"Trade business" in these proof points is used loosely to mean any local service business Lucky's leads run (cleaners, sparkies, builders, plumbers, etc.) — don't flag that wording as a category mismatch.
Check 13 (nothing invented) is about facts specific to THIS lead's business — a made-up detail about them, their team, their location, something they supposedly said. It is NOT about the three proof points above, which are always fair game.

MECHANICAL CHECKS (objective, no judgment call):
1. No dash or em dash anywhere, in the subject or the body
2. The first <p> in the body is a greeting only: "Hey [Name]," if a real name was given, otherwise "Hi," — never "Hey there,"
3. The LAST <p> (before the sign-off) is a one-sentence closing line, e.g. "Looking forward to hearing from you." — the second-to-last <p> is the CTA line (check 6), and the closing line always comes after it
4. Contains none of: "hope this finds you well", "just checking in", "touching base", "circling back", "I wanted to reach out", "I'd love to connect", "don't hesitate to reach out"
5. Contains none of: "automated SMS", "AI voice call", "30-second response", "follow-up sequence", "Meta ads", "done-for-you system", "our system", "our platform", "our process", "we built"
6. {{CTA_CHECK}}
7. Length in range: initial email 4-6 sentences, follow-ups 2-4 sentences

JUDGMENT CHECKS (read it like the business owner would):
8. Opening paragraph is about THEM, not "I" or Lucky
9. References at least one specific, real detail from the notes/research given below, not just "trade business in [location]"
10. Names the actual job type(s) they do, not a generic "more work" or "more jobs"
11. If a proof point is used, it actually fits their trade
12. Sounds like a person texting, not a brand — no corporate phrasing
13. Nothing invented — no fact, name, or detail that isn't in the notes/research/website given below. This is the most important check: if the email confidently states something specific that wasn't given to you, that is always a judgment fail, no exceptions.

Respond with ONLY a JSON object, no markdown fences, no other text:
{"mechanical_fails": ["..."], "judgment_flags": ["..."], "reasoning": "one or two sentences on the overall call"}

mechanical_fails and judgment_flags are arrays of short strings naming exactly which numbered check failed and why, in your own words. Empty arrays if everything passes. Do not include a "verdict" field, the caller derives it from whether either array is non-empty.`;

export async function checkEmailQuality(input: EmailQualityInput): Promise<EmailQualityVerdict> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });

  const ctaCheck = input.requireCtaPlaceholder === false
    ? "The second-to-last <p> is a real call to action (a real link or a clear next step), not a passive close"
    : "The second-to-last <p> is a real call to action containing {{CTA_LINK}}, not a passive close";
  const system = QUALITY_CHECK_SYSTEM_PROMPT.replace("{{CTA_CHECK}}", ctaCheck);

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
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<{ mechanical_fails?: string[]; judgment_flags?: string[]; reasoning?: string }>(block.text);

  const mechanicalFails = parsed.mechanical_fails || [];
  const judgmentFlags = parsed.judgment_flags || [];

  return {
    verdict: mechanicalFails.length === 0 && judgmentFlags.length === 0 ? "approved" : "rejected",
    mechanicalFails,
    judgmentFlags,
    reasoning: parsed.reasoning || "",
  };
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

1. Write exactly ONE short sentence that replaces a generic line like "I came across {company} and wanted to see if something similar could work for a {trade} business in {location}":
   - If real website text is provided, reference something TRUE and SPECIFIC from it (a service they offer, area they cover, something distinctive) — this is by far the best source, prefer it over anything else
   - Otherwise if they have no website: point out that's costing them search traffic to competitors who do have one
   - Otherwise if they have a Facebook page but no website: note the mismatch (decent social presence, but missing from Google searches)
   - Otherwise if they have both a website and Facebook with no scraped text: just note you came across their business while looking at {trade} companies in {location}, naturally
   - If real notes are provided (e.g. from a call), reference the most specific detail from them instead
   - Never invent a detail that isn't actually given to you
   - Sound like a real person noticed something, not a sales tool — casual, no corporate phrases, no dashes or em dashes
   - No greeting, sign-off, or call to action — just the one sentence

2. Try to find the owner's first name using these sources in order of priority:
   a. If the scraped website text clearly names a real person as the owner, founder, or main contact (e.g. "Owner: John Smith", "Run by Sarah and her team", a bio with a name) — extract their first name
   b. If the business name itself is person-named (e.g. "Mike's Electrical", "Sarah's Cleaning", "Dave Johnson Plumbing", "Tom & Sons Builders") — extract that first name
   c. Otherwise return null — never guess or invent a name that isn't clearly there

Respond with ONLY a JSON object, no markdown fences, no other text: {"sentence": "...", "contact_name": "John" or null}`;

export async function generatePersonalizationHook(input: PersonalizationHookInput): Promise<{ hook: string; contactName: string | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });

  const websiteSnippet = input.website ? await fetchWebsiteSnippet(input.website) : "";

  const userPrompt = `Business: ${input.company}
Trade: ${input.trade || "unknown"}
Location: ${input.location || "unknown"}
Website: ${input.website || "none found"}
Facebook: ${input.facebook || "none found"}
Notes: ${input.notes || "none"}
${websiteSnippet ? `\nReal text scraped from their website:\n${websiteSnippet}` : ""}`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: PERSONALIZATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<{ sentence?: string; contact_name?: string | null }>(block.text);
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
