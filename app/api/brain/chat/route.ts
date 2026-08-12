import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "@/lib/supabase";
import { withWritingStyle, parseJsonResponse, stripDashes } from "@/lib/ai";
import { buildBrainContext } from "@/lib/brainContext";

export const dynamic = "force-dynamic";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const BRAIN_SYSTEM_PROMPT = `You are Lucky's business brain for LS Growth Agency — a single place he asks questions about the business and gets you to draft things, instead of digging through Supabase, Gmail, or Google Docs himself.

You'll be given, below your own instructions: how LS Growth operates (Agency Brain), a live snapshot of the lead pipeline, the status of running automations, any Google Docs a live search found relevant to his question, what's on his Calendar for the next 7 days, the cold-call Sheets that are tracked (with called/not-called counts for any that match his question), any inbox emails matching his question by subject, and Meta Ads campaign performance for the last 30 days. Use whatever is actually relevant, ignore the rest. If something isn't covered by any of this, say so plainly rather than guessing.

You can do two things:
1. Just answer the question, conversationally, like a sharp operator who actually knows the business.
2. If Lucky is asking you to draft something (a follow-up email to a specific lead, or a note/plan for something else), write the actual draft — never claim you can't draft things. An email draft always needs a real lead identified by its lead_id (the exact slug shown in the pipeline data, e.g. "acme-electrical", not the display company name) so it can be matched to a real record — if you can't tell which lead he means, ask instead of drafting against nothing.

Nothing you draft is ever sent automatically — everything lands in a queue on the page for Lucky to approve or reject himself, so don't hedge about safety, just draft it properly.

Respond with ONLY a JSON object, no markdown fences, no other text:
{"reply": "your conversational answer, always present", "draft": {"kind": "email" or "note", "leadId": "exact lead_id slug, only for kind email", "subject": "for kind email only, 4-7 words", "title": "for kind note only, short label", "content": "for email: the body as HTML, only <p> and <a> tags. for note: plain text"}}

Omit "draft" entirely if you're not drafting anything this turn — most replies won't have one.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const message: string = (body.message || "").trim();
  const history: ChatTurn[] = Array.isArray(body.history) ? body.history : [];
  if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });

  const sb = createSupabaseClient();

  const [systemPrompt, contextBlock] = await Promise.all([
    withWritingStyle(BRAIN_SYSTEM_PROMPT),
    buildBrainContext(message),
  ]);

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: `${systemPrompt}\n\n---\n\n${contextBlock}`,
    messages: [
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user" as const, content: message },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return NextResponse.json({ error: "No response from Claude" }, { status: 502 });

  let parsed: { reply?: string; draft?: { kind?: string; leadId?: string; subject?: string; title?: string; content?: string } };
  try {
    parsed = parseJsonResponse(textBlock.text);
  } catch {
    // Fall back to the raw text as a plain reply rather than dropping the turn.
    return NextResponse.json({ reply: textBlock.text.trim(), draftCreated: false });
  }

  const reply = stripDashes(parsed.reply || textBlock.text.trim());
  let draftCreated = false;

  const draft = parsed.draft;
  if (draft?.kind === "email" || draft?.kind === "note") {
    let leadUuid: string | null = null;
    if (draft.kind === "email") {
      if (!draft.leadId) return NextResponse.json({ reply, draftCreated: false, error: "Model tried to draft an email with no lead_id — ignored." });
      const { data: lead } = await sb.from("leads").select("id").eq("lead_id", draft.leadId).maybeSingle();
      if (!lead) return NextResponse.json({ reply, draftCreated: false, error: `Model referenced unknown lead_id "${draft.leadId}" — ignored.` });
      leadUuid = lead.id;
    }

    const { error } = await sb.from("chat_drafts").insert({
      kind: draft.kind,
      title: draft.kind === "email" ? stripDashes(draft.subject || "Follow-up") : (draft.title || "Note"),
      lead_id: leadUuid,
      content: stripDashes(draft.content || ""),
    });
    draftCreated = !error;
  }

  return NextResponse.json({ reply, draftCreated });
}
