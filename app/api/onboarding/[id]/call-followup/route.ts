import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { sendFreeformEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const body = await req.json();
  const callNotes: string = body.callNotes || "";
  if (!callNotes.trim()) return NextResponse.json({ error: "No call notes provided" }, { status: 400 });

  const sb = createSupabaseClient();
  const { data: client, error } = await sb
    .from("onboarding_clients")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error || !client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (!client.email) return NextResponse.json({ error: "No email on file for this client" }, { status: 400 });

  const today = new Date().toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const existingNotes = client.notes?.trim() || "";

  const prompt = `You are writing a follow-up email for Lucky at LS Growth Agency. LS Growth manages lead generation and outreach for trade businesses.

Today: ${today}
This email follows an onboarding call that just happened. Use the call notes to write a post-call follow-up.

CLIENT:
Company: ${client.company}
Contact: ${client.name}
Email: ${client.email}

CALL NOTES:
${callNotes.trim()}

${existingNotes ? `PREVIOUS NOTES:\n${existingNotes}` : ""}

---

Write a short follow-up email. Rules:
- Reference what was actually discussed on the call — next steps, what was agreed, what's coming
- 2–4 sentences. Warm and professional, not salesy.
- First <p> is the greeting ("Hey Mike," or "Hi Sarah,")
- Never use: "circle back", "hope this finds you well", "I wanted to reach out", "just checking in"
- No sign-off (added separately)
- HTML: only <p> and <a> tags
- Subject: 4–6 words, specific to the call

Respond ONLY with valid JSON, no markdown:
{"subject": "", "bodyHtml": ""}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
  });

  if (!res.ok) return NextResponse.json({ error: "Claude error" }, { status: 502 });
  const data = await res.json();
  const text: string = data.content?.[0]?.text || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ error: "Bad response from Claude" }, { status: 502 });

  const parsed = JSON.parse(match[0]);
  const subject: string = parsed.subject || "";
  const bodyHtml: string = parsed.bodyHtml || "";

  const fullHtml = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">
${bodyHtml}
<p>Cheers,<br>Lucky<br>LS Growth</p>
</div>`;

  await sendFreeformEmail(client.email, subject, fullHtml);

  // Append call notes to client notes
  const todayKey = new Date().toISOString().split("T")[0];
  const entry = `[${todayKey} call] ${callNotes.trim()}`;
  const updatedNotes = existingNotes ? `${existingNotes}\n${entry}` : entry;
  await sb.from("onboarding_clients").update({ notes: updatedNotes }).eq("id", params.id);

  return NextResponse.json({ sent: true, subject, to: client.email });
}
