import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { company, contact_name, trade, location, callNotes } = body;

  if (!callNotes || !callNotes.trim()) {
    return NextResponse.json({ error: "Add some call notes first." }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured." }, { status: 500 });
  }

  const prompt = `You are writing a short follow up email on behalf of Lucky from LS Growth, an outreach agency that helps local trade and service businesses get more leads.

Lead details:
- Company: ${company || "(unknown)"}
- Contact first name: ${contact_name || "there"}
- Trade: ${trade || "(unknown)"}
- Location: ${location || "(unknown)"}

Notes from the cold call just had with this lead:
"""
${callNotes}
"""

Write a short, casual follow up email that references specifics from the call notes (their actual situation, what they said, any pain points or interest) so it reads as personal, not templated. Keep it friendly and low pressure. End with a soft call to action linking to a quick chat, using the href "{{CTA_LINK}}" exactly (it will be replaced later). Sign off as "Lucky" from "LS Growth".

Formatting rules:
- Output the email body as 2 to 4 short HTML paragraphs using only <p> and <a> tags.
- Do NOT include a greeting salutation like "Cheers" or "Lucky" sign off, that gets added automatically.
- Do NOT use dashes or em dashes anywhere.
- Do NOT wrap the output in a div or include the subject inside the body.

Respond with ONLY a JSON object in this exact shape, no markdown fences:
{"subject": "...", "bodyHtml": "<p>...</p><p>...</p>"}`;

  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

  try {
    let lastError = "";

    for (const model of models) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
          }),
        }
      );

      if (!res.ok) {
        lastError = await res.text();
        continue;
      }

      const data = await res.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        lastError = "No response content.";
        continue;
      }

      const parsed = JSON.parse(content);
      if (!parsed.subject || !parsed.bodyHtml) {
        lastError = "Unexpected response shape.";
        continue;
      }

      return NextResponse.json({ subject: parsed.subject, bodyHtml: parsed.bodyHtml });
    }

    return NextResponse.json({ error: `Gemini error: ${lastError}` }, { status: 502 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
