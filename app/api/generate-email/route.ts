import { NextRequest, NextResponse } from "next/server";

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

  const today = new Date().toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" });

  const prompt = `You are helping Lucky from LS Growth, an outreach agency that helps local trade and service businesses get more leads. Lucky has just got off a cold call and typed up some raw notes.

Today's date: ${today}

Raw notes from the call:
"""
${callNotes}
"""

First, read the notes and pull out the lead's details if they're mentioned (company name, contact's first name, email address, trade/industry, location). Leave any field as an empty string "" if it isn't mentioned anywhere in the notes.

Then work out what actually needs to happen next based on the notes, and write a follow up email to match:

- Address the contact by their first name if it's mentioned in the notes (e.g. "Hey Mike,"), otherwise use "Hey there,".

- If a call/meeting has been booked for a specific day/time: write a short meeting confirmation. Structure: "Hey {{name}}," then a line confirming the day/time relative to today (e.g. "today at 1pm", "tomorrow at 10am", "Thursday at 2pm") and saying here's the link to join, then a paragraph containing exactly "[MEETING LINK]" and nothing else, then a paragraph giving a quick heads up on what Lucky wants to cover (specific to the notes), then a short closing paragraph with a time estimate (20 to 30 minutes unless notes say otherwise) and offering to shift the time by text if needed. Subject should reference the day/time and that the link is inside, e.g. "Catch-up today 1pm - quick link inside".

- If the lead asked for something to be sent over (info, pricing, examples, a proposal, etc) and no call is booked: write a short email referencing what they asked for and saying it's attached/coming, or a couple of sentences covering the key points if nothing is being attached. No meeting link needed. End with a low pressure line inviting them to reply with questions, or offering a quick chat using the href "{{CTA_LINK}}" exactly if a next step makes sense.

- Otherwise (general follow up, no meeting booked, nothing specific requested): write a short casual follow up that references specifics from the call (their situation, what they said, objections, interest level) so it reads as personal, not templated. End with one short, low pressure line offering a quick chat, in the href "{{CTA_LINK}}" exactly (it will be replaced later). The link text must be 2 to 4 words (e.g. "quick chat", "quick call this week") and sit naturally inside a sentence, e.g. "Worth a <a href="{{CTA_LINK}}">quick chat</a> about it this week?". Never put the link after a colon or as a standalone phrase.

Tone:
- Plain, relaxed, casual, like a text to someone you've already been speaking with, not a sales pitch.
- Avoid corporate/sales phrases like "make a real difference", "build a more consistent client base", "explore how we can help", "dive a bit deeper", "reliable leads", "bring in those recurring customers you're looking for".
- Don't open with "really enjoyed our chat" or similar stock phrases unless the notes clearly support it.

Formatting rules:
- Output the email body as HTML using only <p> and <a> tags.
- If used, the "[MEETING LINK]" placeholder must be on its own in its own <p> tag, exactly as written, with no other text or links in that paragraph.
- Do NOT include a "Cheers" or "Lucky" sign off, that gets added automatically.
- Do NOT use dashes or em dashes anywhere in the body paragraphs.
- Do NOT wrap the output in a div or include the subject inside the body.

Respond with ONLY a JSON object in this exact shape, no markdown fences, no other text:
{"company": "...", "contact_name": "...", "email": "...", "trade": "...", "location": "...", "subject": "...", "bodyHtml": "<p>...</p><p>...</p>"}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
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

    return NextResponse.json({
      company: parsed.company || "",
      contact_name: parsed.contact_name || "",
      email: parsed.email || "",
      trade: parsed.trade || "",
      location: parsed.location || "",
      subject: parsed.subject,
      bodyHtml: parsed.bodyHtml,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
