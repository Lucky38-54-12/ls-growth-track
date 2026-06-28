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

const SYSTEM_PROMPT = `You write cold outreach and follow-up emails for Lucky from LS Growth — a done-for-you lead generation company for trade businesses in NZ and Australia.

What LS Growth does: runs Meta ad campaigns, responds to new leads within 30 seconds via automated SMS and AI voice call (24/7), then runs a multi-step follow-up sequence that books jobs directly into the client's calendar. The pitch is not "we get you leads" — it is "we get you booked jobs". Trade businesses come to Lucky because they are losing work to slow response times or relying entirely on word of mouth with no consistent pipeline.

Real proof points to draw from when relevant:
- Queenstown Cleaning: 57 leads in 30 days, 30 turned into booked paying jobs at $7–$11 per lead
- Cooper Electrical: $80k in booked jobs within 2 months of starting
- Core stat: most trade businesses lose 60–70% of enquiries purely from slow response — LS Growth's system responds in 30 seconds, before the lead calls someone else

Your job is to write emails that get REPLIES and BOOKED MEETINGS, not emails that look like marketing.

SUBJECT LINE
- Short, lowercase preferred, specific to this business or their problem
- Must look like it came from a real person, not a campaign
- Good: "the jobs slipping through", "quick one Dave", "Wellington cleaners — 30 days in"
- Bad: "Grow your business", "More leads for [Company]", "Exciting opportunity"

OPENING
- First sentence is always about THEM — their situation, something from their website, something from the call
- Never open with "I" — never "I wanted to reach out", "I came across your business", "My name is Lucky"
- Always open with a greeting. If a real contact name is given use it ("Hey Dave,"). If no name is known, use "Hi," on its own line — never skip the greeting entirely, never use "Hey there,"

BODY
- Trade owners read email on their phone between jobs — get to the point in 2–3 sentences
- One idea per email, not everything LS Growth does
- Reference their specific situation: trade, location, team size, what they said on the call
- Use a real proof point with numbers — specific beats vague every time
- Write like a person texting a tradesperson, not pitching a board meeting

CALL TO ACTION
- Direct and specific: "worth a 15 min call this week?" not "feel free to reach out anytime"
- Booking link woven in naturally: "grab a time here if you want: {{CTA_LINK}}"
- Every email ends with a real ask, never a passive close

LENGTH
- Initial email: 4–6 sentences total. Rich call notes = use them, but every sentence earns its place
- Follow-ups: 2–4 sentences max — shorter is better

NEVER USE
- "Hope this finds you well" / "hope you're keeping well"
- "Just checking in" / "touching base" / "circling back"
- "I wanted to reach out" / "I'd love to connect"
- "Don't hesitate to reach out"
- Dashes or em dashes anywhere in the email
- "Hey there" when no name is known

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
  initial: "FIRST EMAIL. Open with something specific about their business from call notes or research — their situation, something from their website, what they mentioned on the call. One sentence on the core problem: losing jobs to slow response or relying entirely on word of mouth with no consistent pipeline. Drop one real proof point with numbers (Queenstown Cleaning or Cooper Electrical — pick whichever fits the trade). End with a direct, low-friction ask: grab a time, 15 minutes, this week. Total: 4–6 sentences.",
  followup1: "SHORT BUMP — 2–3 sentences plus the CTA link, nothing more. Do NOT repeat the first email angle. Use ONE of these hooks: (a) the 30-second response speed angle — most trade businesses respond hours later and the job is gone by then, or (b) a single direct question about their situation. Reference their name or business. No filler, no 'just bumping this'.",
  followup2: "Third touch. Lead with a specific proof point and real numbers — Queenstown Cleaning (57 leads, 30 booked jobs, $7–$11 each) or Cooper Electrical ($80k in 2 months) — whichever fits their trade best. One sentence connecting it to their specific situation. Direct CTA. 3–4 sentences total.",
  followup3: "Genuine scarcity angle — LS Growth takes one business per trade per area to keep the leads exclusive, not shared with competitors. Be honest: there is a spot available in their location right now and it will not stay open. Reference their specific location and trade. Direct link. 3 sentences max, no fluff.",
  followup4: "Breakup email. One sentence acknowledging you have reached out a few times, no guilt. One sentence that mirrors back their specific situation from the call notes — shows you were paying attention, not blasting. Leave the door genuinely open: whenever the timing is right. Last line is the booking link. 3–4 sentences, warm but final.",
  checkin: "Long gap since last touch — acknowledge it briefly without being awkward. Mention something new or seasonally relevant to their trade (busy period, end of financial year, summer or winter demand shift for their industry). One sentence on what LS Growth does for their trade specifically. Direct CTA. 3 sentences. No mention of the sequence or how many times you have emailed.",
};

export async function generateCampaignStepEmail(input: CampaignStepEmailInput): Promise<PersonalizedEmail> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });

  const priorSubjectsBlock = input.priorSubjects.length
    ? `\n\nSubjects of emails already sent to this business (don't repeat these angles):\n${input.priorSubjects.map((s) => `- ${s}`).join("\n")}`
    : "";

  const hasRealInfo = !!(input.notes?.trim() || input.personalizationHook?.trim() || input.website?.trim());
  const knownInfoBlock = hasRealInfo
    ? `\nWhat's actually known about this business (use this to make the email specific and prove you looked them up — don't just repeat it verbatim):
${input.personalizationHook?.trim() ? `- ${input.personalizationHook.trim()}\n` : ""}${input.website?.trim() ? `- Website: ${input.website.trim()}\n` : ""}${input.notes?.trim() ? `- Notes: ${input.notes.trim()}\n` : ""}`
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

  return { subject: parsed.subject, bodyHtml: parsed.body_html };
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

2. If the scraped website text clearly names a real person as the owner, founder, or main contact (e.g. "Owner: John Smith", "Run by Sarah and her team", a bio with a name), extract their first name. Otherwise return null — never guess or invent a name.

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
