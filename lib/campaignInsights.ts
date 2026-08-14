import Anthropic from "@anthropic-ai/sdk";

export interface CampaignTestIdea {
  headline: string;
  angle: string;
  why: string;
  sourceUrl: string | null;
}

export interface CampaignAnalysis {
  verdict: "winning" | "losing" | "mixed" | "too_early";
  diagnosis: string;
  ideas: CampaignTestIdea[];
}

export interface CampaignAnalysisInput {
  campaignName: string;
  status: string;
  trade: string;
  location: string;
  spend: number;
  clicks: number;
  ctr: number;
  results: number | null;
  costPerResult: number | null;
  resultType: string | null;
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

const SYSTEM_PROMPT = `You analyze a single Meta ad campaign's real performance for Lucky from LS Growth, a lead generation agency that runs Meta ads for trade and home service businesses in NZ and Australia.

You'll be given the campaign's actual metrics (spend, clicks, CTR, results, cost per result, status) for a specific trade/niche. Use the web_search tool to check what's currently working on Meta paid ads for that niche (Meta Ad Library, agency case studies, competitor pages) before forming your recommendation — don't rely on general knowledge alone.

1. Diagnose this specific campaign using its real numbers: "winning" (efficient cost per result, worth scaling), "losing" (spend with no/expensive results, worth killing or fixing), "mixed" (some signal but not conclusive), or "too_early" (not enough spend/data yet to judge, e.g. under $10 spent).
2. Write a short, direct 2-3 sentence diagnosis that references the actual numbers given — not generic advice.
3. Suggest 3 concrete new ad ideas to test that address whatever gap the real data reveals, grounded in current Meta ad research for this niche. Each idea should explain specifically why it addresses this campaign's situation, not just "what's trending."

Respond with ONLY a JSON object as your final message, no markdown fences, no other text:
{"verdict": "winning" or "losing" or "mixed" or "too_early", "diagnosis": "...", "ideas": [{"headline": "...", "angle": "...", "why": "...", "source_url": "..." or null}]}`;

export async function analyzeCampaign(input: CampaignAnalysisInput): Promise<CampaignAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY_AD_RESEARCH || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY_AD_RESEARCH env var is not set");

  const client = new Anthropic({ apiKey });

  const userPrompt = `Campaign: ${input.campaignName}
Status: ${input.status}
Trade/niche: ${input.trade}
Location: ${input.location}

Last 30 days performance:
- Spend: $${input.spend.toFixed(2)}
- Clicks: ${input.clicks}
- CTR: ${input.ctr.toFixed(2)}%
- Results: ${input.results ?? 0}${input.resultType ? ` (${input.resultType.replace(/_/g, " ")})` : ""}
- Cost per result: ${input.costPerResult ? `$${input.costPerResult.toFixed(2)}` : "n/a"}

Diagnose this campaign and suggest what to test next.`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3072,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 } as const],
  });

  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("Unexpected response from AI");

  const parsed = parseJsonResponse<Partial<CampaignAnalysis>>(text);
  if (!parsed.diagnosis || !parsed.ideas) throw new Error("AI response missing diagnosis or ideas");

  return {
    verdict: parsed.verdict === "winning" || parsed.verdict === "losing" || parsed.verdict === "mixed" || parsed.verdict === "too_early" ? parsed.verdict : "mixed",
    diagnosis: parsed.diagnosis,
    ideas: parsed.ideas.map((i) => ({
      headline: i.headline || "",
      angle: i.angle || "",
      why: i.why || "",
      sourceUrl: i.sourceUrl || (i as unknown as { source_url?: string }).source_url || null,
    })),
  };
}
