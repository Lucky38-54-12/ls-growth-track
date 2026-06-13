import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { company, contact_name, trade, location, callNotes } = body;

  if (!callNotes || !callNotes.trim()) {
    return NextResponse.json({ error: "Add some call notes first." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
  }

  const today = new Date().toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" });

  const prompt = `You are writing a short follow up email on behalf of Lucky from LS Growth, an outreach agency that helps local trade and service businesses get more leads. Lucky has just got off a cold call with this lead.

Today's date: ${today}

Lead details:
- Company: ${company || "(unknown)"}
- Contact first name: ${contact_name || "there"}
- Trade: ${trade || "(unknown)"}
- Location: ${location || "(unknown)"}

Notes from the call just had with this lead:
"""
${callNotes}
"""

First, work out what actually needs to happen next based on the notes, then write the email to match:

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

Respond with ONLY a JSON object in this exact shape, no markdown fences:
{"subject": "...", "bodyHtml": "<p>...</p><p>...</p>"}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `OpenAI error: ${errText}` }, { status: 502 });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "No response content." }, { status: 502 });
    }

    const parsed = JSON.parse(content);
    if (!parsed.subject || !parsed.bodyHtml) {
      return NextResponse.json({ error: "Unexpected response shape." }, { status: 502 });
    }

    return NextResponse.json({ subject: parsed.subject, bodyHtml: parsed.bodyHtml });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
