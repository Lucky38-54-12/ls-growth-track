import Anthropic from "@anthropic-ai/sdk";

// Facebook Pages are public, but their "About" section is client-side
// rendered — a plain HTML fetch won't contain it. The og:title/og:description
// meta tags are server-rendered for link-preview purposes though, and
// reliably carry the Page's name and tagline/about blurb, which is enough
// to seed a draft without needing any Graph API permissions (those are
// gated behind App Review for reading Page metadata).
async function fetchFacebookPageSnippet(pageId: string): Promise<{ name: string; snippet: string }> {
  const res = await fetch(`https://www.facebook.com/${pageId}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  });
  const html = await res.text();
  const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
  const description = html.match(/<meta property="og:description" content="([^"]*)"/)?.[1];
  return {
    name: (title || "").replace(/&amp;/g, "&").replace(/&#039;/g, "'"),
    snippet: (description || "").replace(/&amp;/g, "&").replace(/&#039;/g, "'"),
  };
}

export interface AutofillDraft {
  description: string;
  services: string[];
  service_areas: string[];
  faqs: { question: string; answer: string }[];
  extra_context: string;
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

// Drafts a starting-point client config from whatever public snippet we
// could pull off their Facebook Page — meant to be reviewed/edited by a
// human before saving, not trusted blind. Businesses without a website
// (common for smaller trades) otherwise get no auto-fill at all today.
export async function draftConfigFromFacebookPage(pageId: string, trade: string): Promise<AutofillDraft> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const { name, snippet } = await fetchFacebookPageSnippet(pageId);
  if (!snippet) {
    throw new Error("Could not read anything public from this Facebook Page — it may be private, or Facebook blocked the request.");
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 700,
    system: `You draft a starting-point business profile for a lead-qualification AI, based on a snippet of text pulled from a small business's Facebook Page. The business owner will review and edit everything before it goes live, so it's fine to be reasonably concise and only include things you can actually infer from the text — don't invent specific stats, prices, or guarantees that aren't implied.

Respond with ONLY a JSON object, no markdown fences, in this exact shape:
{"description": "one line, e.g. 'residential and commercial cleaning company based in X'", "services": ["service 1", "service 2"], "service_areas": ["area 1"], "faqs": [{"question": "...", "answer": "..."}], "extra_context": "any other useful detail from the text (guarantees, product claims, hours, etc), or empty string if nothing extra"}

If the text doesn't mention a location/service area at all, return an empty array for service_areas rather than guessing one.`,
    messages: [
      {
        role: "user",
        content: `Business name (from their Facebook Page): ${name || "(unknown)"}\nTrade/industry: ${trade || "(unknown)"}\nText pulled from their Facebook Page:\n${snippet}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Claude");
  return parseJsonResponse<AutofillDraft>(textBlock.text);
}
