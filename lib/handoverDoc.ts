import Anthropic from "@anthropic-ai/sdk";
import { createDocFromMarkedText } from "./googleDocs";

const ai = new Anthropic();

// Fired once per client, right after the signed agreement is closed off —
// this is the marketing team's brief, so it deliberately excludes anything
// about what the client is paying LS Growth (management fee, deposit,
// payment terms). Ad spend budget and what the campaign is focusing on stay
// in, since marketing needs those to build a strategy.
export interface HandoverDocInput {
  company: string;
  contactName?: string;
  services?: string[];
  adBudget?: string;
  creativesNeeded?: string;
  dealNotes?: string;
  callSummary?: string;
}

export async function generateHandoverDocText(input: HandoverDocInput): Promise<{ title: string; body: string }> {
  const msg = await ai.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2500,
    messages: [
      {
        role: "user",
        content: `You write internal marketing handover briefs for LS Growth (a marketing agency) — this is what the marketing team reads to build a campaign strategy for a client who just signed and closed.

Keep it SHORT and scannable — bullet points, not paragraphs. This is a brief, not a transcript. The marketing team doesn't manage the client relationship (Lucky does that directly), so leave out anything that's just Lucky's own follow-up/logistics with the client — chasing assets, account access, Dropbox links, platform-connection troubleshooting, etc. Only include what marketing actually needs to build and run the campaign: who the client is, what to focus on, the lead-quality bar, budget, and the handful of context points that would actually change how the campaign is built or messaged (e.g. "burned by agencies before, needs early visible results" or "quality over volume — 2 good leads/month beats 10 mediocre ones").

Also leave out anything about what the client is paying LS Growth — no management fee, no deposit, no payment terms, no pricing of any kind, even if it's in the source notes below.

CLIENT INFO:
Business name: ${input.company}
${input.contactName ? `Contact: ${input.contactName}\n` : ""}${input.services?.length ? `Services to focus on: ${input.services.filter(Boolean).join(", ")}\n` : ""}${input.adBudget ? `Ad budget: ${input.adBudget}\n` : ""}${input.creativesNeeded ? `Creatives available/needed: ${input.creativesNeeded}\n` : ""}

DEAL NOTES (what was agreed on the call — pull trial length, performance conditions, target/focus, timelines from here; skip anything about fees or what the client pays):
${input.dealNotes || "(none provided)"}

FULL CALL SUMMARY (source material only — do not dump this in, extract only the few points that would actually change how marketing builds the campaign):
${input.callSummary || "(none provided)"}

Output ONLY the document text, nothing else — no preamble, no markdown code fences, no commentary. Formatting rules:
- First line starts with "# " followed by the title: "${input.company} — Marketing Handover".
- Section headings prefixed with exactly "## ", never deeper.
- Every section is bullet points ("• "), not paragraphs — one line per point, no more than 2 lines if a point genuinely needs it.
- Sections, in order (skip one only if there's truly nothing to put in it): Client Overview (2-3 bullets max: business, location/territory, what they do), What We're Focusing On (services/target + the lead-quality bar — the actual number/definition of a qualified lead if one was agreed), Trial / Performance Terms (duration + performance condition only, never a dollar fee), Ad Budget, Creative Assets (what exists and is usable right now — not who's chasing it or how), Key Context (3-5 bullets max — only points that change how the campaign should be built, targeted, or messaged).
- Never invent specifics that aren't in the info above — if something isn't given, say so briefly rather than guessing.`,
      },
    ],
  });

  const raw = (msg.content[0] as { type: string; text: string }).text.trim();
  return { title: `${input.company} — Marketing Handover`, body: raw };
}

export async function generateHandoverDoc(input: HandoverDocInput, parentFolderId?: string): Promise<string> {
  const { title, body } = await generateHandoverDocText(input);
  return createDocFromMarkedText(title, body, parentFolderId);
}
