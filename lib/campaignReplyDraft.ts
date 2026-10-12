import { stripDashes, withWritingStyle } from "@/lib/ai";
import { Lead } from "@/lib/types";
import { QUEENSTOWN_FOLLOWUP_LINE, PERL_FOLLOWUP_LINE } from "@/lib/proofPoints";

// Drafts a reply to a lead who responded to the cold-email campaign —
// created as a pending chat_draft (see lib/campaignReplies.ts) for Lucky to
// review/edit/send from /dashboard/approvals, same "approval is the real
// action, nothing auto-sends" pattern as every other Brain draft. Unlike the
// fixed-template sequence emails in lib/sendPipeline.ts, a reply is
// genuinely free-text — there's no fixed template that could cover whatever
// the lead actually asked — so this is one of the few places in outreach
// that still goes through full AI authorship, same as generateCallFollowupEmail.
export async function generateCampaignReplyDraft(
  lead: Lead,
  theirMessage: string
): Promise<{ subject: string; bodyHtml: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const isCleaning = lead.trade?.toLowerCase().includes("clean") ?? false;
  const proofLine = isCleaning ? QUEENSTOWN_FOLLOWUP_LINE : PERL_FOLLOWUP_LINE;

  const prompt = await withWritingStyle(`You are drafting a reply for Lucky at LS Growth Agency to a lead who just replied to his cold email. LS Growth gets trade businesses more booked jobs — specific jobs, real revenue, never describe the mechanism or process.

LEAD:
Company: ${lead.company}
Contact: ${lead.contact_name || "unknown"}
Trade: ${lead.trade || "unknown"}
Location: ${lead.location || "unknown"}

THEIR REPLY:
${theirMessage}

---

Write a short reply. Rules:
- Directly respond to what they actually said — if they asked a question, answer it; if they objected, address it; if they just said "sure, tell me more", move the conversation toward a quick call.
- If (and only if) it fits naturally, you may reference this proof point, worded exactly: "${proofLine}" — never invent a different number or case study.
- If they ask for a time to talk, propose booking a quick call rather than inventing a specific time yourself.
- 2-4 sentences. Human, not salesy.
- First <p> is the greeting using their first name if known, otherwise "Hey,"
- Never use: "circle back", "hope this finds you well", "I wanted to reach out", "just checking in", "following up on my last email"
- No sign-off (added separately)
- HTML: only <p> and <a> tags
- Subject: must start with "Re: " and otherwise be short and natural

Respond ONLY with valid JSON, no markdown:
{"subject": "", "bodyHtml": ""}`);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text: string = data.content?.[0]?.text || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  const parsed = JSON.parse(match[0]);
  if (!parsed.subject || !parsed.bodyHtml) return null;
  return { subject: stripDashes(parsed.subject), bodyHtml: stripDashes(parsed.bodyHtml) };
}
