import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const body = await req.json();
  const callNotes: string = body.callNotes || "";
  if (!callNotes.trim()) return NextResponse.json({ error: "No call notes provided" }, { status: 400 });

  const today = new Date().toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const prompt = `You are writing a post-call recap email on behalf of Lucky from LS Growth Agency, sent to an existing client after an onboarding or check-in call.

Today: ${today}

CALL NOTES:
${callNotes.trim()}

---

STEP 1: Extract the following from the notes:
- name: contact's first name
- company: business name
- email: email address
- phone: phone number

Use "" if not found.

STEP 2: Write a short recap email covering:
- What was discussed on the call
- Any decisions made or things agreed
- Clear next steps (who is doing what)
- Warm, professional tone — this is an existing client, not a prospect
- 2–4 short paragraphs
- First <p> is the greeting: "Hey [Name]," or "Hi," if no name
- No sign-off (added separately)
- HTML: only <p> and <a> tags

STEP 3: Write a subject line — 4–6 words, specific to what was discussed.

Respond ONLY with valid JSON, no markdown:
{"name": "", "company": "", "email": "", "phone": "", "subject": "", "bodyHtml": ""}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 900, messages: [{ role: "user", content: prompt }] }),
  });

  if (!res.ok) return NextResponse.json({ error: "Claude error" }, { status: 502 });
  const data = await res.json();
  const text: string = data.content?.[0]?.text || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ error: "Bad response from Claude" }, { status: 502 });

  const parsed = JSON.parse(match[0]);
  return NextResponse.json({
    name: parsed.name || "",
    company: parsed.company || "",
    email: parsed.email || "",
    phone: parsed.phone || "",
    subject: parsed.subject || "",
    bodyHtml: parsed.bodyHtml || "",
  });
}
