import Anthropic from "@anthropic-ai/sdk";

export interface PortalLeadSummary {
  outcome: string;
  pipeline_stage: string | null;
  booking_status: string | null;
  scheduled_at: string | null;
  created_at: string;
  contact_email: string | null;
  extracted_fields: Record<string, unknown>;
}

export interface PortalChatTurn {
  role: "user" | "assistant";
  content: string;
}

const STAGE_LABELS: Record<string, string> = {
  new_inquiry: "New Inquiry",
  followed_up: "Followed Up",
  not_ready: "Not Ready Yet (email sequence)",
  booked: "Booked Jobs",
  not_a_fit: "Not a Fit",
};

function stageFor(lead: PortalLeadSummary): string {
  if (lead.pipeline_stage) return lead.pipeline_stage;
  if (lead.outcome === "disqualified") return "not_a_fit";
  if (lead.outcome === "nurture") return "not_ready";
  if (lead.outcome === "qualified" && lead.booking_status === "booked") return "booked";
  return "new_inquiry";
}

// Compact one-line-per-lead text instead of raw JSON — keeps token usage
// down and is already close to how a human would summarize a lead list.
function buildLeadsContext(clientName: string, leads: PortalLeadSummary[]): string {
  if (leads.length === 0) return `${clientName} has no leads recorded yet.`;

  const lines = leads.map((lead) => {
    const f = lead.extracted_fields || {};
    const stage = STAGE_LABELS[stageFor(lead)] || stageFor(lead);
    const parts = [
      `stage=${stage}`,
      f.job_type ? `job=${String(f.job_type)}` : null,
      f.location ? `location=${String(f.location)}` : null,
      lead.scheduled_at ? `scheduled=${new Date(lead.scheduled_at).toISOString()}` : null,
      f.phone || lead.contact_email ? `contact=${String(f.phone || lead.contact_email)}` : null,
      `created=${new Date(lead.created_at).toISOString()}`,
    ].filter(Boolean);
    return `- ${parts.join(", ")}`;
  });

  return `${clientName} has ${leads.length} lead(s) on record (most recent first):\n${lines.join("\n")}`;
}

function buildSystemPrompt(clientName: string, leads: PortalLeadSummary[]): string {
  const now = new Date();
  const todayLabel = new Intl.DateTimeFormat("en-NZ", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(now);

  return `You are a helpful assistant embedded in ${clientName}'s client portal for LS Growth, a lead generation service. You answer questions the business owner asks about their own leads and pipeline.

Right now it is ${todayLabel}.

LEAD DATA:
${buildLeadsContext(clientName, leads)}

Pipeline stages, in order: New Inquiry, Followed Up, Not Ready Yet (email sequence), Booked Jobs, Not a Fit.

RULES:
- Only answer from the lead data above. If something isn't in the data (e.g. revenue, prices, marketing spend), say you don't have that information rather than guessing.
- Be concise and direct — a couple of sentences or a short list, not a long report, unless the user clearly wants detail.
- You can count, filter, and summarize the leads above (e.g. "how many booked this week", "any leads from Auckland") — do the counting yourself from the data given.
- Never invent leads, names, numbers, or outcomes that aren't in the data above.
- If asked something unrelated to their leads/pipeline (e.g. general chit-chat), you can respond briefly and naturally, but steer back to being useful for their business.`;
}

export async function runPortalChatTurn(
  clientName: string,
  leads: PortalLeadSummary[],
  history: PortalChatTurn[]
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 700,
    system: [{ type: "text", text: buildSystemPrompt(clientName, leads), cache_control: { type: "ephemeral" } }],
    messages: history.map((turn) => ({ role: turn.role, content: turn.content })),
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Claude");
  return textBlock.text.trim();
}
