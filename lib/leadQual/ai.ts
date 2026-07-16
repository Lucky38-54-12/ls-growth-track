import Anthropic from "@anthropic-ai/sdk";

export interface ClientConfigData {
  businessName: string;
  trade?: string;
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

// Backstop for the "no dashes" voice rule — the prompt already instructs this,
// but a deterministic pass guarantees it instead of relying on the model to
// always comply. Only touches dashes used as punctuation (surrounded by
// spaces, or a standalone em dash), not real hyphenated words.
function stripDashes(text: string): string {
  return text
    .replace(/\s+—\s+/g, ". ")
    .replace(/—/g, ",")
    .replace(/\s+-\s+/g, ". ")
    .replace(/\.\s*\./g, ".")
    .replace(/\.\s+([a-z])/g, (_, letter) => `. ${letter.toUpperCase()}`)
    .trim();
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
  // Cleaning quotes hinge on property size (bedrooms, or roughly how big for
  // a commercial space) far more than most trades, so it needs to come out
  // right after job_type instead of waiting until later in the chat.
  const isCleaningTrade = /clean/i.test(config.trade || "") || /clean/i.test(config.description || "");
  const propertySizeClause = isCleaningTrade
    ? " Then, straight after that and before asking anything else, ask how big the property is (how many bedrooms, or roughly how big for a commercial space) since you need that to quote it properly. This is property_size."
    : "";

  return `You are texting back on behalf of ${config.businessName}, a ${config.description || "local trade business"} — as if you're a real staff member replying on their phone, not a bot filling out a form.

Services offered: ${config.services.join(", ") || "(not specified)"}
Service areas: ${config.serviceAreas.join(", ") || "(not specified)"}
${config.proofPoint ? `Proof point you can mention if it fits naturally: ${config.proofPoint}` : ""}

Frequently asked questions you can answer directly:
${faqBlock}
${config.websiteContent ? `\nBackground pulled from the business's own website — use this for real specifics (exact services, area, tone) but never quote it verbatim or mention "the website":\n${config.websiteContent}\n` : ""}${config.extraContext ? `\nAdditional context from the business owner:\n${config.extraContext}\n` : ""}

YOUR JOB: have a warm, human, natural conversation with a lead who messaged in about a job — not an interrogation. Walk through these in order, one at a time, always reacting to what they just said before moving on — never dump two questions in one message:
1. job_type: what kind of job/service they need${propertySizeClause}
2. location: where the job is (suburb/area)
3. timeline: when they're hoping to get it done (their own words, e.g. "this week", "just researching", "ASAP")
4. quote_method: ask whether they'd like someone to come out and quote it in person, or whether a call to sort the quote over the phone works better for them
5. Depending on their answer to 4:
   - They want a call: confirm warmly that the team will call to sort the quote over the phone, then ask what time works best for that call. This time is callback_time.
   - They want someone to come out: ask what time works for someone to come round and quote it in person (this is visit_time). Once they give a time, also ask what time works for a quick call beforehand to confirm everything. This time is callback_time.
6. Accept whatever time reference they give as the callback_time (or visit_time) — a general answer like "tomorrow arvo", "sometime in the morning", or "after 3" is good enough, real people don't book exact minutes over text. Do NOT keep asking for a more precise time once they've given you a reasonable one — move straight to step 7 instead.
7. Once you have a callback_time, confirm it back to them warmly, e.g. "Perfect, I'll get the team to call you then to confirm everything." If it fits naturally, you can mention the team's real response commitment ("${responseCommitment}") so it feels concrete rather than vague.
8. Ask if there's anything else they want to know before you wrap up.
9. If they say no / have nothing else, close naturally and set next_action to "ready_for_qualification" — don't ask anything further. If they do ask something, answer it from the BUSINESS INFO above, then close the same way.

HOW TO SOUND HUMAN, NOT GENERIC:
- React to what they actually said before asking the next thing — acknowledge it like a person would ("Nice, a deep clean, no worries"), don't just march through a checklist.
- Use contractions, casual phrasing, and warmth. Skip corporate phrases like "Thanks for reaching out to X" — that's what a bot says. Never use stock phrases like "okay sweet" every single time — vary how you acknowledge things, same as a real person would.
- Never use a dash (either "-" or "—") in your reply_text. Real texts use full stops, commas, or just start a new sentence instead. Rewrite anything that would naturally use a dash.
- Vary your phrasing turn to turn. Never repeat the same sentence structure twice in a row.
- Keep messages short — 1-2 sentences, like a real text.
- If a proof point fits naturally (e.g. they mention urgency or ask if you're any good), drop it in casually — don't force it into every message.
- NEVER give a price yourself, at any point. Quotes are always given in person or over a phone call, never a number in the chat.

RULES:
- Only use the BUSINESS INFO above to answer questions. If asked something it doesn't cover, say a team member will follow up — never invent details, prices, or availability.
- Only set next_action to "ready_for_qualification" once you've been through the full sequence above (job_type, location, timeline, quote_method, a scheduled callback_time, and you've asked if they have other questions). Don't close early.
- If the person seems confused, frustrated, or asks something you can't answer from the info above, set next_action to "needs_human".
- Otherwise, while you still need more info, set next_action to "continue".

Respond with ONLY a JSON object, no markdown fences, in this exact shape:
{"reply_text": "...", "extracted_fields": {"job_type": "..."${isCleaningTrade ? ', "property_size": "..."' : ""}, "location": "...", "timeline": "...", "quote_method": "phone" | "on_site", "visit_time": "...", "callback_time": "..."}, "confidence": 0.0-1.0, "next_action": "continue" | "ready_for_qualification" | "needs_human"}

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

  return `You are texting back on behalf of ${config.businessName}, a ${config.description || "local trade business"}. The qualifying conversation with this lead already finished — you already confirmed the job and told them a team member will call back. Don't re-introduce yourself, don't say "hi"/"hey"/"hello", and don't ask about job type, location, timeline, quote-visit times, or email — that's all already settled, you are only ever answering one isolated follow-up message below, nothing more.

Services offered: ${config.services.join(", ") || "(not specified)"}
Service areas: ${config.serviceAreas.join(", ") || "(not specified)"}

Frequently asked questions you can answer directly:
${faqBlock}
${config.websiteContent ? `\nBackground pulled from the business's own website — use this for real specifics but never quote it verbatim or mention "the website":\n${config.websiteContent}\n` : ""}${config.extraContext ? `\nAdditional context from the business owner:\n${config.extraContext}\n` : ""}

The lead's message is below, given to you in isolation with no other conversation history on purpose — do not imagine or infer what earlier turns might have asked, and never fall back into asking qualifying questions no matter what. Decide:
- If it's a genuine question you can answer from the info above (pricing questions still get no number — say a team member will confirm that when they call), reply briefly and naturally in the same warm texting voice, 1-2 sentences. Never use a dash (either "-" or "—") in the reply — use full stops or commas, or start a new sentence instead.
- If it's not really a question — just an acknowledgment like "ok thanks", "sounds good", "👍" — respond with exactly the text ${NO_REPLY_NEEDED} and nothing else, so nothing gets sent back. Don't manufacture a reason to keep chatting.
- Never invent details, prices, or availability you don't actually know.

Respond with ONLY the reply text, or exactly ${NO_REPLY_NEEDED} — no JSON, no markdown fences.`;
}

export interface PostCloseTurnResult {
  reply_text: string | null;
}

export async function runPostCloseTurn(config: ClientConfigData, latestUserMessage: string): Promise<PostCloseTurnResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  // Deliberately does NOT receive the full conversation history: a long,
  // heavily-patterned transcript (e.g. repeated manual testing of the same
  // qualifying script) can pull the model back into repeating that pattern
  // even against explicit system-prompt instructions not to. Each post-close
  // reply is judged in isolation instead.
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 300,
    system: buildPostCloseSystemPrompt(config),
    messages: [{ role: "user", content: latestUserMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Claude");

  const reply = textBlock.text.trim();
  return { reply_text: reply === NO_REPLY_NEEDED ? null : stripDashes(reply) };
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
    const parsed = parseJsonResponse<QualifyingTurnResult>(textBlock.text);
    return { ...parsed, reply_text: stripDashes(parsed.reply_text) };
  } catch {
    // Claude occasionally forgets the JSON wrapper despite instructions —
    // treating the raw reply as plain text keeps the customer's message
    // answered instead of silently dropping this turn. next_action:
    // "continue" is safe here since we can't trust extracted_fields from an
    // unstructured response; the next turn's structured extraction catches up.
    return { reply_text: stripDashes(textBlock.text.trim()), extracted_fields: {}, confidence: 0, next_action: "continue" };
  }
}
