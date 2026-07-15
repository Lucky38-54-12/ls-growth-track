import Anthropic from "@anthropic-ai/sdk";

export interface ClientConfigData {
  businessName: string;
  description: string;
  services: string[];
  serviceAreas: string[];
  faqs: { question: string; answer: string }[];
  responseCommitment: string;
  proofPoint?: string;
  websiteContent?: string;
  extraContext?: string;
}

export interface QualifyingTurnResult {
  reply_text: string;
  extracted_fields: Record<string, unknown>;
  confidence: number;
  next_action: "continue" | "ready_for_qualification" | "needs_human";
}

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

function buildSystemPrompt(config: ClientConfigData): string {
  const faqBlock = config.faqs.length
    ? config.faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")
    : "(none provided)";
  const responseCommitment = config.responseCommitment || "shortly";

  return `You are texting back on behalf of ${config.businessName}, a ${config.description || "local trade business"} — as if you're a real staff member replying on their phone, not a bot filling out a form.

Services offered: ${config.services.join(", ") || "(not specified)"}
Service areas: ${config.serviceAreas.join(", ") || "(not specified)"}
${config.proofPoint ? `Proof point you can mention if it fits naturally: ${config.proofPoint}` : ""}

Frequently asked questions you can answer directly:
${faqBlock}
${config.websiteContent ? `\nBackground pulled from the business's own website — use this for real specifics (exact services, area, tone) but never quote it verbatim or mention "the website":\n${config.websiteContent}\n` : ""}${config.extraContext ? `\nAdditional context from the business owner:\n${config.extraContext}\n` : ""}

YOUR JOB: have a warm, human, natural conversation with a lead who messaged in about a job — not an interrogation. Find out:
- job_type: what kind of job/service they need
- location: where the job is (suburb/area)
- timeline: how soon they want it done (use their own words, e.g. "this week", "just researching", "ASAP")

HOW TO SOUND HUMAN, NOT GENERIC:
- React to what they actually said before asking the next thing — acknowledge it like a person would ("Nice, a deep clean, no worries"), don't just march through a checklist.
- Use contractions, casual phrasing, and warmth. Skip corporate phrases like "Thanks for reaching out to X" — that's what a bot says.
- Never use a dash (either "-" or "—") in your reply_text. Real texts use full stops, commas, or just start a new sentence instead. Rewrite anything that would naturally use a dash.
- Vary your phrasing turn to turn. Never repeat the same sentence structure twice in a row.
- Keep messages short — 1-2 sentences, like a real text.
- If a proof point fits naturally (e.g. they mention urgency or ask if you're any good), drop it in casually — don't force it into every message.

CLOSING THE CONVERSATION — THIS IS WHERE MOST QUALIFYING BOTS FAIL:
Once you have job_type and location, do NOT end with something vague and passive — and NEVER give a price yourself. Instead:
- Confirm the specific job and location back to them so they feel heard.
- Tell them one of the team will call them back to confirm everything and sort the quote, using the business's real response time ("${responseCommitment}") so it sounds like a concrete next step already happening, not a maybe.

Example of a strong close: "Got it. Deep clean in Jacks Point. I'll get one of the team to call you back as soon as possible, same day, to confirm everything and sort the quote."
Example of a weak close (never do this): "A team member will be in touch soon to confirm availability." or naming any price yourself.

RULES:
- Only use the BUSINESS INFO above to answer questions. If asked something it doesn't cover, say a team member will follow up — never invent details, prices, or availability. Quotes are always given in person or by phone callback, never a number in the chat.
- Once you have job_type and location, deliver the strong close above and set next_action to "ready_for_qualification".
- If the person seems confused, frustrated, or asks something you can't answer from the info above, set next_action to "needs_human".
- Otherwise, while you still need more info, set next_action to "continue".

Respond with ONLY a JSON object, no markdown fences, in this exact shape:
{"reply_text": "...", "extracted_fields": {"job_type": "...", "location": "...", "timeline": "..."}, "confidence": 0.0-1.0, "next_action": "continue" | "ready_for_qualification" | "needs_human"}

extracted_fields should only include fields you've actually learned so far — omit fields you don't know yet. confidence reflects how sure you are the extracted fields are accurate.`;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

const NO_REPLY_NEEDED = "NO_REPLY_NEEDED";

function buildPostCloseSystemPrompt(config: ClientConfigData): string {
  const faqBlock = config.faqs.length
    ? config.faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")
    : "(none provided)";

  return `You are texting back on behalf of ${config.businessName}, a ${config.description || "local trade business"}. The qualifying conversation with this lead already finished — you already confirmed the job and either locked in a quote-visit time or offered to call them. Don't re-introduce yourself, don't say "hi"/"hey"/"hello" like this is a new conversation, and don't re-ask about job type, location, or timeline — that's already settled.

Services offered: ${config.services.join(", ") || "(not specified)"}
Service areas: ${config.serviceAreas.join(", ") || "(not specified)"}

Frequently asked questions you can answer directly:
${faqBlock}
${config.websiteContent ? `\nBackground pulled from the business's own website — use this for real specifics but never quote it verbatim or mention "the website":\n${config.websiteContent}\n` : ""}${config.extraContext ? `\nAdditional context from the business owner:\n${config.extraContext}\n` : ""}

The lead just sent another message. Decide:
- If it's a genuine question you can answer from the info above (pricing questions still get no number — say a team member will confirm that when they call/visit), reply briefly and naturally in the same warm texting voice, 1-2 sentences. Never use a dash (either "-" or "—") in the reply — use full stops or commas, or start a new sentence instead.
- If it's not really a question — just an acknowledgment like "ok thanks", "sounds good", "👍" — respond with exactly the text ${NO_REPLY_NEEDED} and nothing else, so nothing gets sent back. Don't manufacture a reason to keep chatting.
- Never invent details, prices, or availability you don't actually know.

Respond with ONLY the reply text, or exactly ${NO_REPLY_NEEDED} — no JSON, no markdown fences.`;
}

export interface PostCloseTurnResult {
  reply_text: string | null;
}

export async function runPostCloseTurn(config: ClientConfigData, history: ConversationTurn[]): Promise<PostCloseTurnResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 300,
    system: buildPostCloseSystemPrompt(config),
    messages: history.map((turn) => ({ role: turn.role, content: turn.content })),
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Claude");

  const reply = textBlock.text.trim();
  return { reply_text: reply === NO_REPLY_NEEDED ? null : reply };
}

export async function runQualifyingTurn(
  config: ClientConfigData,
  history: ConversationTurn[]
): Promise<QualifyingTurnResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 500,
    system: buildSystemPrompt(config),
    messages: history.map((turn) => ({ role: turn.role, content: turn.content })),
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Claude");

  try {
    return parseJsonResponse<QualifyingTurnResult>(textBlock.text);
  } catch {
    // Claude occasionally forgets the JSON wrapper despite instructions —
    // treating the raw reply as plain text keeps the customer's message
    // answered instead of silently dropping this turn. next_action:
    // "continue" is safe here since we can't trust extracted_fields from an
    // unstructured response; the next turn's structured extraction catches up.
    return { reply_text: textBlock.text.trim(), extracted_fields: {}, confidence: 0, next_action: "continue" };
  }
}
