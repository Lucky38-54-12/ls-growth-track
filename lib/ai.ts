import Anthropic from "@anthropic-ai/sdk";

export interface PersonalizedEmailInput {
  company: string;
  contactName: string;
  trade: string;
  location: string;
  callNotes: string;
}

export interface PersonalizedEmail {
  subject: string;
  bodyHtml: string;
}

const SYSTEM_PROMPT = `You write short, casual, personalized follow-up emails for LS Growth, a company that runs done-for-you lead generation (ads, follow-up, booking) for trade businesses in NZ and Australia, run by a guy named Lucky.

You'll be given details about a business that was previously called, including notes from that call. Write a follow-up email that:
- References specifics from the call notes naturally (don't just repeat them verbatim, weave them in)
- Sounds like a real person wrote it, not a template — casual, friendly, concise
- Is 3-5 short sentences/paragraphs max
- Ends with a call to action linking to a quick chat, using exactly the placeholder {{CTA_LINK}} as the href
- Signs off as "Lucky, LS Growth"

Respond with ONLY a JSON object, no markdown fences, no other text:
{"subject": "...", "body_html": "..."}

body_html should be a series of <p>...</p> tags only (no surrounding <div>, no signature paragraph — that's added separately, no pixel/tracking tags).`;

export async function generatePersonalizedEmail(input: PersonalizedEmailInput): Promise<PersonalizedEmail> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });

  const userPrompt = `Business: ${input.company}
Contact name: ${input.contactName || "there"}
Trade: ${input.trade || "unknown"}
Location: ${input.location || "unknown"}

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

  let parsed: { subject?: string; body_html?: string };
  try {
    parsed = JSON.parse(block.text.trim());
  } catch {
    throw new Error(`Could not parse AI response as JSON: ${block.text.slice(0, 200)}`);
  }

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

const PERSONALIZATION_SYSTEM_PROMPT = `You write ONE short sentence for a cold outreach email on behalf of Lucky from LS Growth, a company that runs done-for-you lead generation (ads, follow up, booking) for trade businesses in NZ and Australia.

You'll be given a business's name, trade, location, and what's known about their online presence (website, Facebook page, any notes). Write exactly one sentence that replaces a generic line like "I came across {company} and wanted to see if something similar could work for a {trade} business in {location}."

Rules:
- Reference something TRUE and SPECIFIC about this business's online presence — don't invent anything
- If they have no website: point out that's costing them search traffic to competitors who do have one
- If they have a Facebook page but no website: note the mismatch (decent social presence, but missing from Google searches)
- If they have both a website and Facebook: skip the gap-angle, just note you came across their business while looking at {trade} companies in {location}, naturally
- If real notes are provided (e.g. from a call), reference the most specific detail from them instead of the website/Facebook angle
- Sound like a real person noticed something, not a sales tool — casual, one sentence, no corporate phrases
- No dashes or em dashes
- Do NOT include a greeting, sign-off, or call to action — just the one sentence

Respond with ONLY the sentence text, no quotes, no JSON, no markdown.`;

export async function generatePersonalizationHook(input: PersonalizationHookInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });

  const userPrompt = `Business: ${input.company}
Trade: ${input.trade || "unknown"}
Location: ${input.location || "unknown"}
Website: ${input.website || "none found"}
Facebook: ${input.facebook || "none found"}
Notes: ${input.notes || "none"}`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: PERSONALIZATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from AI");

  return validateHook(block.text.trim());
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
Contact name: ${input.contactName || "there"}
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
