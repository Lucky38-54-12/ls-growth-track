import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { notes } = await req.json();
  if (!notes?.trim()) return NextResponse.json({ summary: "" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ summary: notes.slice(0, 120) });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 80,
      messages: [{
        role: "user",
        content: `Summarise these call notes in one short sentence (max 15 words). Just the key outcome — what happened, what's next. No punctuation at the end.\n\n${notes}`,
      }],
    }),
  });

  if (!res.ok) return NextResponse.json({ summary: notes.slice(0, 120) });
  const data = await res.json();
  const summary = data.content?.[0]?.text?.trim() || notes.slice(0, 120);
  return NextResponse.json({ summary });
}
