import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { fetchWebsiteSnippet } from "@/lib/website";
import { checkEmailQuality, stripDashes } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { callNotes } = body;

  if (!callNotes || !callNotes.trim()) {
    return NextResponse.json({ error: "Add some call notes first." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
  }

  const today = new Date().toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // If this lead was already auto-prospected (it usually has been — Call Queue
  // leads carry a website, trade, and cold-call research notes from before the
  // call even happened), pull that record so the email can be grounded in real
  // specifics instead of generic "trade business" phrasing.
  const emailMatch = callNotes.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  let knownInfoBlock = "";
  let existingLeadId: string | null = null;
  let existingLeadNotes = "";
  if (emailMatch) {
    const sb = createSupabaseClient();
    const { data: existingLead } = await sb
      .from("leads")
      .select("lead_id, company, trade, location, website, facebook, notes")
      .eq("email", emailMatch[0].toLowerCase())
      .maybeSingle();

    if (existingLead) {
      existingLeadId = existingLead.lead_id;
      existingLeadNotes = existingLead.notes || "";
      const websiteSnippet = existingLead.website ? await fetchWebsiteSnippet(existingLead.website) : "";
      const parts = [
        `Company: ${existingLead.company}`,
        `Trade: ${existingLead.trade || "unknown"}`,
        `Location: ${existingLead.location || "unknown"}`,
      ];
      if (existingLead.notes?.trim()) parts.push(`Prep notes from before the call:\n${existingLead.notes.trim()}`);
      if (websiteSnippet) parts.push(`Text scraped from their website (${existingLead.website}) — use this to reference something real and specific about what they actually do, don't quote it verbatim:\n${websiteSnippet}`);
      knownInfoBlock = `\n\nKNOWN INFO ABOUT THIS BUSINESS (from prior research — use it to make the email specific, don't just repeat it):\n${parts.join("\n\n")}`;
    }
  }

  const prompt = `You are writing a follow-up email on behalf of Lucky from LS Growth Agency. Lucky just got off a cold call and has written up some notes on how it went. Your job is to turn those notes into a short, human-sounding email that sounds like Lucky actually wrote it.

LS Growth Agency gets trade businesses more booked jobs. The pitch is always the outcome — specific booked jobs, real revenue — never the process or mechanism. Never say "we built a system", "automated SMS", "AI voice call", "Meta ads", "30-second response", "follow-up sequence", "done-for-you", or anything describing how it works. This year alone LS Growth has generated over $300,000 worth of booked work for trade businesses across NZ. Use the research and call notes to identify the specific job types this business does (heat pumps, switchboard upgrades, solar, end-of-tenancy cleans, etc.) and reference those by name instead of saying "trade business" or "more jobs" generically.

Today's date: ${today}

Raw notes from the call:
"""
${callNotes}
"""
${knownInfoBlock}

---

STEP 1: EXTRACT LEAD DETAILS

From the notes, extract:
- company: business name
- contact_name: first name only
- email: email address
- trade: what kind of business they run
- location: city/region if mentioned
- phone: phone number if mentioned
- date_called: date of the call if mentioned
- meeting_datetime: if they agreed to a specific call/meeting day and time, work out the actual date (relative to today's date above) and return it as "YYYY-MM-DDTHH:MM" in 24-hour NZ local time (e.g. "2026-06-18T15:30"). Otherwise "".

Use empty string "" if not found.

---

STEP 2: CLASSIFY THE CALL

Read the notes carefully and classify into ONE of these:

A) MEETING_BOOKED - they agreed to a call/meeting with a specific day or time mentioned
B) WANTS_INFO - interested but asked for more info, pricing, a link, or something specific before committing
C) NOT_READY_YET - showed genuine interest but wasn't ready to move forward (e.g. "not right now", "not sure yet", "want to think about it") - this is a warm lead, just slow
D) GENERAL_FOLLOWUP - call went okay, no strong signal either way, just keeping the door open

IMPORTANT: If a specific time is mentioned in the notes (e.g. "3:30pm", "Wednesday 3:30"), always classify as MEETING_BOOKED regardless of how uncertain the notes sound. The tone of the email (e.g. acknowledging hesitation) is handled separately in STEP 3 — classification here is just about whether a time was set.

---

STEP 3: WRITE THE EMAIL

Rules that apply to ALL emails:
- Tone: friendly but professional. This is an email to a business owner who pays (or could pay) for a service, not a text to a mate. Sound like a real person who takes their work seriously, not a sales tool and not overly casual.
- Short, 2-5 sentences max per paragraph. Never more than 3 paragraphs.
- The very first <p> must be the greeting on its own line. If a contact name was found use it: "Hey Mike,". If no name was found, use "Hi," — never "Hey there,", never skip the greeting, never jump straight into the message.
- The second-to-last <p> must be a short natural closing line before the sign-off (which is added separately). Match the tone: for meeting confirmations/follow-ups use "Looking forward to speaking with you." or "Looking forward to our chat." For info/general emails use "Looking forward to hearing from you." For not-ready-yet emails use "I'll leave the door open — reach out whenever the time's right." One sentence only, no fluff.
- The opening reference to the call must match how long ago it was. Use the date_called field and today's date to work this out:
  * Same day or yesterday: "Good talking earlier" or "Good chat earlier today" is fine
  * 2–6 days ago: "Following up from our call earlier this week" or similar
  * 1–4 weeks ago: "Following up from when we spoke a couple of weeks back" or similar
  * 1–6 months ago: "Following up from when we had a chat a few months back" or similar
  * Over 6 months or date unknown: "Following up from when we last spoke" — never assume it was recent
  * Never say "Good talking earlier" or "Good chat" unless the call was same day or yesterday
- Reference at least ONE specific thing from the notes that proves you were actually on that call with them — not just their industry, something particular they said or wanted
- Whenever you refer to their type of business, use the actual trade by name (e.g. "fencing businesses", "cleaning companies", "builders") — NEVER the generic phrase "trade business" or "trade businesses". If KNOWN INFO ABOVE includes website text, work in one specific, real detail from it (a service they offer, the area they cover, the kind of jobs they do) so it's obvious you actually looked at their business, not just their industry
- Never use these phrases anywhere in the email: "Just confirming", "I get it", "yeah so", "anyway", "I want to dig into". Write in full, clear, professional sentences throughout — this is going to a business owner, treat it like a real business email.
- No dashes or em dashes anywhere
- No corporate phrases: never use "make a real difference", "explore how we can help", "circle back", "hope this finds you well", "I wanted to reach out", "just wanted to", "following up on our chat", "it was great speaking with you", "I really enjoyed our conversation"
- No sign-off (Lucky's name and signature are added separately)
- HTML: only using <p> and <a> tags. Nothing else.

Case-specific rules:

A) MEETING_BOOKED:
- After the greeting, write one line: "Looking forward to our chat [day] at [time]. Here's the link to join:" using the actual day and time from the notes, written naturally (e.g. "today at 1pm", "Wednesday at 3:30pm")
- Include [MEETING LINK] on its own line in its own paragraph directly after that line
- One paragraph referencing the specific problem or objection they raised on the call and framing the meeting around addressing that — this is the most important part, make it feel personal not generic
- End with this exact line as its own paragraph: "Shouldn't take more than 20-30 minutes. If anything comes up and you need to shift the time, just flick me a text."
- Do not add anything else

B) WANTS_INFO:
- Open by referencing exactly what they asked for
- Give them what they need or point them to it
- One soft CTA link to https://lsgrowth.agency/book
- Don't push hard

C) NOT_READY_YET:
- Acknowledge where they're at without making it weird
- Give them one genuinely useful thing (a stat, a question) relevant to what they mentioned
- Keep the door open casually, no CTA link, just "let me know when the time's right" energy
- This should feel like a message from someone who's not desperate

D) GENERAL_FOLLOWUP:
- Reference something specific from the call
- Keep it casual and brief
- End with a relaxed inline CTA link (2-4 words like "keen to chat" or "grab a time") linking to https://lsgrowth.agency/book

---

STEP 4: WRITE THE SUBJECT LINE

Short, 4-7 words. No clickbait. No "Following up". Should feel like something a real person would write to someone they just spoke to. Reference the specific context if possible.

---

OUTPUT FORMAT

Respond ONLY with a valid JSON object. No explanation, no markdown, no backticks. Exactly this shape:

{"company": "", "contact_name": "", "email": "", "trade": "", "location": "", "phone": "", "date_called": "", "meeting_datetime": "", "call_type": "MEETING_BOOKED | WANTS_INFO | NOT_READY_YET | GENERAL_FOLLOWUP", "subject": "", "bodyHtml": ""}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Claude error: ${errText}` }, { status: 502 });
    }

    const data = await res.json();
    const content: string | undefined = data.content?.[0]?.text;
    if (!content) {
      return NextResponse.json({ error: "No response content." }, { status: 502 });
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Unexpected response shape." }, { status: 502 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.subject || !parsed.bodyHtml) {
      return NextResponse.json({ error: "Unexpected response shape." }, { status: 502 });
    }

    // The model reliably slips an em/en dash into this copy no matter how the
    // "no dashes" rule is worded in the prompt above (same issue documented in
    // lib/ai.ts) — strip deterministically rather than relying on compliance.
    const subject = stripDashes(parsed.subject);
    const bodyHtml = stripDashes(parsed.bodyHtml);

    const caseStudyBlock = `<p>If you want to see some case studies, here's a link to our website:</p><p><a href="https://lsgrowth.agency">https://lsgrowth.agency</a></p>`;
    const finalBodyHtml = bodyHtml + caseStudyBlock;

    // Same quality gate as the automated campaign sends — this path is
    // already human-reviewed (Lucky sees the preview before clicking Save &
    // Send), so a rejection doesn't block anything, it just surfaces as a
    // badge so he knows to actually read this one instead of trusting it.
    // Checked against parsed.bodyHtml (the AI-written part only), not
    // finalBodyHtml — the case-study block below is a fixed block this route
    // always appends after the close, same as how the campaign path checks
    // its email before the "Cheers, Lucky" signature gets added on.
    let quality: { verdict: "approved" | "rejected"; mechanicalFails: string[]; judgmentFlags: string[]; reasoning: string } | null = null;
    try {
      quality = await checkEmailQuality({
        subject,
        bodyHtml,
        step: "cold_call_followup",
        contactName: parsed.contact_name,
        notes: [callNotes, existingLeadNotes].filter(Boolean).join("\n---\n"),
        requireCtaPlaceholder: false,
        meetingAlreadyBooked: parsed.call_type === "MEETING_BOOKED",
      });
      const sb = createSupabaseClient();
      await sb.from("email_checks").insert({
        lead_id: existingLeadId || `cold-call-${(parsed.company || parsed.email || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        step: "cold_call_followup",
        subject,
        body_html: finalBodyHtml,
        verdict: quality.verdict,
        mechanical_fails: quality.mechanicalFails,
        judgment_flags: quality.judgmentFlags,
        reasoning: quality.reasoning,
        sent: false,
      });
    } catch {
      // Quality check is advisory here, not a gate — never block the cold-call
      // flow (or Lucky's ability to send) just because the checker itself failed.
    }

    return NextResponse.json({
      company: parsed.company || "",
      contact_name: parsed.contact_name || "",
      email: parsed.email || "",
      trade: parsed.trade || "",
      location: parsed.location || "",
      meetingDateTime: parsed.meeting_datetime || "",
      subject,
      bodyHtml: finalBodyHtml,
      quality,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
