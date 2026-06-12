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
