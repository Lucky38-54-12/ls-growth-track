import { createSupabaseClient } from "@/lib/supabase";
import { searchInboxByFrom, fetchMessageDetail } from "@/lib/gmail";
import { Lead } from "@/lib/types";
import { stripDashes, withWritingStyle } from "@/lib/ai";
import { describeMeetingTime } from "@/lib/calendar";

export async function generateCallFollowupEmail(
  lead: Lead,
  callNotes: string,
  opts: { includesVideo?: boolean } = {}
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

  const videoLine = opts.includesVideo
    ? `\n- A short video from Lucky gets attached right after your final paragraph (a thumbnail card, not embedded). End your last sentence with a natural lead-in to it — e.g. mention you recorded a quick video/clip for them — don't say "click below" or describe the image itself.`
    : "";

  const prompt = await withWritingStyle(`You are writing a follow-up email for Lucky at LS Growth Agency. LS Growth gets trade businesses more booked jobs — specific jobs, real revenue, never describe the mechanism or process.

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
- Subject: 4–6 words, real and specific, no "Following up"${videoLine}

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
  // Same em/en dash habit documented in lib/ai.ts — prompt wording alone
  // doesn't reliably stop it, so strip deterministically before this ever
  // reaches a send.
  return { subject: stripDashes(parsed.subject || ""), bodyHtml: stripDashes(parsed.bodyHtml || "") };
}

// Lucky's fixed template for the video-intro email sent to Builder-trade
// leads once a meeting's booked on the call — separate from the calendar
// invite email (see followup route), so this one carries no .ics and just a
// plain meet-link mention. Everything but the one-sentence recap is fixed;
// only that sentence needs to reflect the actual call, so it's the only
// part asked of the AI (a full free-form email isn't what's wanted here).
export async function generateVideoIntroEmail(
  lead: Lead,
  callNotes: string,
  meetingStartISO: string,
  hangoutLink: string
): Promise<{ subject: string; bodyHtml: string }> {
  const contactName = lead.contact_name && lead.contact_name !== "there" ? lead.contact_name : "";
  const fallbackRecap = `we'll have a look at getting ${lead.company} more booked jobs`;

  // e.g. "today at 3:30pm", "tomorrow at 10am", "Wednesday at 3:30pm" — the
  // same day+time phrasing the rest of the app uses, instead of a hardcoded
  // "tomorrow" that's wrong whenever the meeting isn't literally the next day.
  const meetingLabel = describeMeetingTime(meetingStartISO);
  const dayLabel = meetingLabel.split(" at ")[0];

  let recapLine = fallbackRecap;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const prompt = await withWritingStyle(`Write ONE short sentence recapping what an upcoming call with a lead will cover, to slot into this template after "Just as a quick recap, ":

"Just as a quick recap, {SENTENCE}."

LEAD:
Company: ${lead.company}
Trade: ${lead.trade || "unknown"}
Location: ${lead.location || "unknown"}

CALL NOTES:
${callNotes}

Rules:
- Start lowercase, no leading capital, no trailing period (added by the template)
- Reflect what was actually discussed on the call, not generic filler
- One sentence only, no more than 20 words
- Never describe the mechanism or process, just the outcome/topic
- When referring to the business getting more work/jobs, refer to it as "you"/"your business" or by the company name (${lead.company}) — never by the contact person's first name. The contact is a person; the work goes to the company, not to them personally (e.g. "getting you more renovation work", not "getting [Name] more renovation work")

Respond ONLY with valid JSON, no markdown:
{"recapLine": ""}`);

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 200, messages: [{ role: "user", content: prompt }] }),
      });
      if (res.ok) {
        const data = await res.json();
        const text: string = data.content?.[0]?.text || "";
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed.recapLine) recapLine = stripDashes(parsed.recapLine);
        }
      }
    } catch {
      // fall back to the generic recap line
    }
  }

  const base = process.env.APP_URL || "https://app.lsgrowth.agency";
  const videoUrl = `${base}/videos/lucky-intro.mp4`;
  const thumbUrl = `${base}/videos/lucky-intro-thumb.jpg`;

  const bodyHtml = [
    `<p>Hi${contactName ? ` ${contactName}` : ""},</p>`,
    `<p>Looking forward to our chat ${meetingLabel}.</p>`,
    `<p>Here's the link to join:</p>`,
    `<p><a href="${hangoutLink}">${hangoutLink}</a></p>`,
    `<p>Just as a quick recap, ${recapLine}.</p>`,
    `<p>Before the call, I also wanted to give you a quick look at what we actually do.</p>`,
    `<p><a href="${videoUrl}"><img src="${thumbUrl}" alt="A quick message from Lucky — tap to watch" width="320" style="max-width:320px;width:100%;height:auto;border:0;display:block;border-radius:8px;" /></a></p>`,
    `<p>It's a short video showing some real campaigns and results we've generated for businesses similar to yours.</p>`,
    `<p>I'll also spend some time before the call looking through your current setup, competitors and where I think there could be opportunities to bring in more work.</p>`,
    `<p>I'll bring what I find to the call and walk you through it.</p>`,
    `<p>The whole thing should only take around 10 to 15 minutes. Even if we decide there's nothing worth doing together, you'll have a few things you can take away from the conversation.</p>`,
    `<p>If anything comes up and you need to shift the time, just flick me a text.</p>`,
    `<p>Looking forward to it.</p>`,
  ].join("\n");

  return { subject: `Looking forward to our chat ${dayLabel}`, bodyHtml };
}
