import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { searchInboxByFrom, fetchMessageDetail, SPECIAL_FOLDERS } from "@/lib/gmail";
import { stripDashes, withWritingStyle } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const liveCallNotes: string = body.callNotes || "";

  const sb = createSupabaseClient();

  // 1. Load the lead
  const { data: lead, error: leadErr } = await sb
    .from("leads")
    .select("*")
    .eq("lead_id", params.id)
    .maybeSingle();
  if (leadErr || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  // 2. Last email we sent them
  const { data: sends } = await sb
    .from("email_sends")
    .select("step, subject, body_html, sent_at")
    .eq("lead_id", params.id)
    .order("sent_at", { ascending: false })
    .limit(1);
  const lastSend = sends?.[0] || null;

  // 3. Check inbox for any reply from their email
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
      // inbox search failed — continue without it
    }
  }

  const today = new Date().toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const lastSentBlock = lastSend
    ? `LAST EMAIL SENT (${new Date(lastSend.sent_at).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}):\nSubject: ${lastSend.subject}\n${lastSend.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800)}`
    : "No previous email on record.";

  const replyBlock = replySnippet
    ? `THEIR REPLY (${new Date(replyDate).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}):\n${replySnippet}`
    : "No reply found in inbox.";

  const combinedNotes = [liveCallNotes.trim(), lead.notes?.trim()].filter(Boolean).join("\n---\n");
  const notesBlock = combinedNotes ? `NOTES (most recent first):\n${combinedNotes}` : "";

  const context = liveCallNotes.trim()
    ? `This email follows a call that just happened. Use the call notes to write a post-call follow-up that reflects what was actually discussed.`
    : `Write a re-engagement follow-up based on the history below.`;

  const prompt = withWritingStyle(`You are writing a follow-up email for Lucky at LS Growth Agency. LS Growth gets trade businesses more booked jobs — specific jobs, real revenue, never describe the mechanism or process.

Today: ${today}
${context}

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
- If call notes are present, reference what was actually said on the call — make it feel like a natural recap
- 2–4 sentences. Human, not salesy.
- First <p> is the greeting ("Hey Mike," or "Hi,")
- Never use: "circle back", "hope this finds you well", "I wanted to reach out", "just checking in", "following up on my last email"
- No sign-off (added separately)
- HTML: only <p> and <a> tags
- Subject: 4–6 words, real and specific, no "Following up"

Respond ONLY with valid JSON, no markdown:
{"subject": "", "bodyHtml": "", "lastTouchSummary": "one sentence describing what the last touchpoint was"}`);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
  });

  if (!res.ok) return NextResponse.json({ error: "Claude error" }, { status: 502 });
  const data = await res.json();
  const text: string = data.content?.[0]?.text || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ error: "Bad response from Claude" }, { status: 502 });

  const parsed = JSON.parse(match[0]);
  return NextResponse.json({
    subject: stripDashes(parsed.subject || ""),
    bodyHtml: stripDashes(parsed.bodyHtml || ""),
    lastTouchSummary: parsed.lastTouchSummary || "",
    to: lead.email,
    contactName: lead.contact_name || "",
    company: lead.company || "",
  });
}
