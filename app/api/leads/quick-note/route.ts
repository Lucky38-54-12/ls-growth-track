import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  if (!text?.trim()) {
    return NextResponse.json({ error: "Write a quick note first." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
  }

  const prompt = `Lucky just tried calling a business and jotted down a quick, messy note (e.g. the owner was out, no answer, call back later). Read it and return JSON with:
- "company": the business name if mentioned, otherwise ""
- "contact_name": the person's first name if mentioned, otherwise ""
- "summary": one short sentence (max 15 words) capturing what happened and any next step (e.g. call back time). No punctuation at the end.

Note:
"""
${text}
"""

Respond ONLY with valid JSON, no markdown, no backticks. Exactly this shape:
{"company": "", "contact_name": "", "summary": ""}`;

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
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Claude error: ${errText}` }, { status: 502 });
    }

    const data = await res.json();
    const content: string | undefined = data.content?.[0]?.text;
    if (!content) return NextResponse.json({ error: "No response content." }, { status: 502 });

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: "Unexpected response shape." }, { status: 502 });

    const parsed = JSON.parse(jsonMatch[0]);
    const company = (parsed.company || "").trim();
    const summary = (parsed.summary || "").trim();

    if (!company) {
      return NextResponse.json({ error: "Couldn't find a business name in that note — mention who you called." }, { status: 400 });
    }

    return NextResponse.json({
      company,
      contact_name: (parsed.contact_name || "").trim(),
      summary: summary || text.trim().slice(0, 120),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
