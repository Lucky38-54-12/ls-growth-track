import { createSupabaseClient } from "@/lib/supabase";
import { searchInboxByFrom, fetchMessageDetail } from "@/lib/gmail";
import { Lead } from "@/lib/types";
import { stripDashes } from "@/lib/ai";

export async function generateCallFollowupEmail(
  lead: Lead,
  callNotes: string
): Promise<{ subject: string; bodyHtml: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const sb = createSupabaseClient();

  const { data: sends } = await sb
    .from("email_sends")
    .select("step, subject, body_html, sent_at")
    .eq("lead_id", lead.lead_id)
    .order("sent_at", { ascending: false })
    .limit(1);
  const lastSend = sends?.[0] || null;

  let replySnippet = "";
  let replyDate = "";
  if (lead.email) {
    try {
      const replies = await searchInboxByFrom(lead.email);
      if (replies.length > 0) {
        const detail = await fetchMessageDetail(replies[0].uid, "INBOX");
        replySnippet = detail.bodyText.replace(/\s+/g, " ").trim().slice(0, 600);
        replyDate = replies[0].date;
      }
    } catch {
      // continue without inbox data
    }
  }

  const today = new Date().toLocaleDateString("en-NZ", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const lastSentBlock = lastSend
    ? `LAST EMAIL SENT (${new Date(lastSend.sent_at).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}):\nSubject: ${lastSend.subject}\n${lastSend.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800)}`
    : "No previous email on record.";

  const replyBlock = replySnippet
    ? `THEIR REPLY (${new Date(replyDate).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}):\n${replySnippet}`
    : "No reply found in inbox.";

  const combinedNotes = [callNotes.trim(), lead.notes?.trim()].filter(Boolean).join("\n---\n");
  const notesBlock = combinedNotes ? `NOTES (most recent first):\n${combinedNotes}` : "";

  const prompt = `You are writing a follow-up email for Lucky at LS Growth Agency. LS Growth gets trade businesses more booked jobs — specific jobs, real revenue, never describe the mechanism or process.

Today: ${today}
This email follows a call that just happened. Use the call notes to write a post-call follow-up that reflects what was actually discussed.

LEAD:
Company: ${lead.company}
Contact: ${lead.contact_name || "unknown"}
Email: ${lead.email}
Trade: ${lead.trade || "unknown"}
Location: ${lead.location || "unknown"}

${lastSentBlock}

${replyBlock}

${notesBlock}

---

Write a short follow-up email. Rules:
- Reference what was actually said on the call — make it feel like a natural recap
- 2–4 sentences. Human, not salesy.
- First <p> is the greeting ("Hey Mike," or "Hi,")
- Never use: "circle back", "hope this finds you well", "I wanted to reach out", "just checking in", "following up on my last email"
- No sign-off (added separately)
- HTML: only <p> and <a> tags
- Subject: 4–6 words, real and specific, no "Following up"

Respond ONLY with valid JSON, no markdown:
{"subject": "", "bodyHtml": ""}`;

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
  // Same em/en dash habit documented in lib/ai.ts — prompt wording alone
  // doesn't reliably stop it, so strip deterministically before this ever
  // reaches a send.
  return { subject: stripDashes(parsed.subject || ""), bodyHtml: stripDashes(parsed.bodyHtml || "") };
}
