import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "@/lib/supabase";
import { withWritingStyle, parseJsonResponse, stripDashes } from "@/lib/ai";
import { buildBrainContext } from "@/lib/brainContext";
import { LeadStatus } from "@/lib/types";

const VALID_LEAD_STATUSES: readonly LeadStatus[] = [
  "not_contacted", "contacted", "followup_1_sent", "followup_2_sent", "followup_3_sent", "followup_4_sent",
  "replied", "booked", "not_interested", "bounced", "sequence_complete", "reenroll_queue", "no_show",
  "rebooked", "proposal_sent", "closed", "no_close", "thinking_about_it", "discovery_done",
];

export const dynamic = "force-dynamic";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const BRAIN_SYSTEM_PROMPT = `You are Lucky's business brain for LS Growth Agency — a single place he asks questions about the business and gets you to draft things, instead of digging through Supabase, Gmail, or Google Docs himself.

You'll be given, below your own instructions: how LS Growth operates (Agency Brain), a live snapshot of the lead pipeline, the status of running automations, any Google Docs a live search found relevant to his question, what's on his Calendar for the next 7 days, the cold-call Sheets that are tracked (with called/not-called counts for any that match his question), any inbox emails matching his question by subject, and Meta Ads campaign performance for the last 30 days. Use whatever is actually relevant, ignore the rest. If something isn't covered by any of this, say so plainly rather than guessing.

You can do three things:
1. Just answer the question, conversationally, like a sharp operator who actually knows the business.
2. If Lucky is asking you to draft something (a follow-up email to a specific lead, or a note/plan for something else), write the actual draft — never claim you can't draft things.
3. If Lucky is asking you to change a real lead record (its status, add a note, set a follow-up date), propose that as a lead_update — never claim you can't do this, propose it and let the approval queue handle safety.

An email or lead_update always needs a real lead identified by its lead_id (the exact slug shown in the pipeline data, e.g. "acme-electrical", not the display company name) so it can be matched to a real record — if you can't tell which lead he means, ask instead of guessing.

For a lead_update, only these fields exist, don't invent others: status (must be one of ${VALID_LEAD_STATUSES.join(", ")}), notes (free text — this is added as a new note, not a full replacement), follow_up_at (a date, "YYYY-MM-DD"). Only include the fields Lucky actually asked to change.

Nothing you draft or propose is ever applied automatically — everything lands in a queue on the page for Lucky to approve or reject himself, so don't hedge about safety, just propose it properly.

Respond with ONLY a JSON object, no markdown fences, no other text:
{"reply": "your conversational answer, always present", "draft": {"kind": "email" or "note" or "lead_update", "leadId": "exact lead_id slug, for kind email and lead_update", "subject": "for kind email only, 4-7 words", "title": "for kind note only, short label", "content": "for email: the body as HTML, only <p> and <a> tags. for note: plain text", "fields": {"status"?: "...", "notes"?: "...", "follow_up_at"?: "YYYY-MM-DD"}}}

"fields" is only used for kind lead_update — omit it otherwise. Omit "draft" entirely if you're not drafting/proposing anything this turn — most replies won't have one.`;

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

  let parsed: {
    reply?: string;
    draft?: {
      kind?: string; leadId?: string; subject?: string; title?: string; content?: string;
      fields?: { status?: string; notes?: string; follow_up_at?: string };
    };
  };
  try {
    parsed = parseJsonResponse(textBlock.text);
  } catch {
    // Fall back to the raw text as a plain reply rather than dropping the turn.
    return NextResponse.json({ reply: textBlock.text.trim(), draftCreated: false });
  }

  const reply = stripDashes(parsed.reply || textBlock.text.trim());
  let draftCreated = false;

  const draft = parsed.draft;
  if (draft?.kind === "email" || draft?.kind === "note" || draft?.kind === "lead_update") {
    let leadUuid: string | null = null;
    if (draft.kind === "email" || draft.kind === "lead_update") {
      if (!draft.leadId) return NextResponse.json({ reply, draftCreated: false, error: `Model tried to ${draft.kind === "email" ? "draft an email" : "update a lead"} with no lead_id — ignored.` });
      const { data: lead } = await sb.from("leads").select("id").eq("lead_id", draft.leadId).maybeSingle();
      if (!lead) return NextResponse.json({ reply, draftCreated: false, error: `Model referenced unknown lead_id "${draft.leadId}" — ignored.` });
      leadUuid = lead.id;
    }

    if (draft.kind === "lead_update") {
      const fields = draft.fields || {};
      const payload: { status?: LeadStatus; notes?: string; follow_up_at?: string } = {};
      if (fields.status && (VALID_LEAD_STATUSES as readonly string[]).includes(fields.status)) payload.status = fields.status as LeadStatus;
      if (fields.notes?.trim()) payload.notes = stripDashes(fields.notes.trim());
      if (fields.follow_up_at?.trim()) payload.follow_up_at = fields.follow_up_at.trim();

      if (Object.keys(payload).length === 0) {
        return NextResponse.json({ reply, draftCreated: false, error: "Model proposed a lead update with no valid fields — ignored." });
      }

      const summaryLines = [
        payload.status ? `Set status to ${payload.status}.` : "",
        payload.notes ? `Add note: ${payload.notes}` : "",
        payload.follow_up_at ? `Set follow-up date to ${payload.follow_up_at}.` : "",
      ].filter(Boolean);

      const { error } = await sb.from("chat_drafts").insert({
        kind: "lead_update",
        title: "Update lead",
        lead_id: leadUuid,
        content: summaryLines.join("\n"),
        payload,
      });
      draftCreated = !error;
    } else {
      const { error } = await sb.from("chat_drafts").insert({
        kind: draft.kind,
        title: draft.kind === "email" ? stripDashes(draft.subject || "Follow-up") : (draft.title || "Note"),
        lead_id: leadUuid,
        content: stripDashes(draft.content || ""),
      });
      draftCreated = !error;
    }
  }

  return NextResponse.json({ reply, draftCreated });
}
