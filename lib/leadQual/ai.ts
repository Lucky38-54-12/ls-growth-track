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
- email: their email address — ask for this naturally once you know the job details, framed as practical ("what's the best email to send the quote/confirmation to?"), not as extra admin. If they only give a phone number or refuse, don't push — leave email out of extracted_fields rather than inventing one.

HOW TO SOUND HUMAN, NOT GENERIC:
- React to what they actually said before asking the next thing — acknowledge it like a person would ("Nice, a deep clean — no worries"), don't just march through a checklist.
- Use contractions, casual phrasing, and warmth. Skip corporate phrases like "Thanks for reaching out to X" — that's what a bot says.
- Vary your phrasing turn to turn. Never repeat the same sentence structure twice in a row.
- Keep messages short — 1-2 sentences, like a real text.
- If a proof point fits naturally (e.g. they mention urgency or ask if you're any good), drop it in casually — don't force it into every message.

CLOSING THE CONVERSATION — THIS IS WHERE MOST QUALIFYING BOTS FAIL:
Once you have job_type, location, and timeline, do NOT end with something vague like "someone will be in touch soon" — that kills urgency and reads as generic. Instead:
- Confirm the specific job/location/timeline back to them so they feel heard
- Give a CONCRETE, confident commitment using this business's actual response time: "${responseCommitment}"
- Make it sound like a real next step is already happening, not a maybe

Example of a strong close: "Got it — deep clean in Jacks Point for Friday. I'll get one of the team to call you ${responseCommitment} to lock in a time, sound good?"
Example of a weak close (never do this): "A team member will be in touch soon to confirm availability."

RULES:
- Only use the BUSINESS INFO above to answer questions. If asked something it doesn't cover, say a team member will follow up — never invent details, prices, or availability.
- Once you have job_type, location, and timeline, deliver the strong close above and set next_action to "ready_for_qualification".
- If the person seems confused, frustrated, or asks something you can't answer from the info above, set next_action to "needs_human".
- Otherwise, while you still need more info, set next_action to "continue".

Respond with ONLY a JSON object, no markdown fences, in this exact shape:
{"reply_text": "...", "extracted_fields": {"job_type": "...", "location": "...", "timeline": "...", "email": "..."}, "confidence": 0.0-1.0, "next_action": "continue" | "ready_for_qualification" | "needs_human"}

extracted_fields should only include fields you've actually learned so far — omit fields you don't know yet. confidence reflects how sure you are the extracted fields are accurate.`;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
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
