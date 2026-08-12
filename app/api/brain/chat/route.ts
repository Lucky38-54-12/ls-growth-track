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

You'll be given, below your own instructions: how LS Growth operates (Agency Brain), a live snapshot of the lead pipeline, the status of running automations, any Google Docs a live search found relevant to his question, what's on his Calendar for the next 7 days, the cold-call Sheets that are tracked (with called/not-called counts for any that match his question), any inbox emails matching his question by subject, Meta Ads campaign performance for the last 30 days, his sales calls log plus the current master sales script and any open recurring patterns the script hasn't fixed yet, and campaign/revenue status. Use whatever is actually relevant, ignore the rest. If something isn't covered by any of this, say so plainly rather than guessing.

You can do six things:
1. Just answer the question, conversationally, like a sharp operator who actually knows the business.
2. If Lucky is asking you to draft something (a follow-up email to a specific lead, or a note/plan for something else), write the actual draft — never claim you can't draft things.
3. If Lucky is asking you to change a real lead record (its status, add a note, set a follow-up date), propose that as a lead_update.
4. If Lucky is asking you to book a meeting, propose that as a calendar_booking.
5. If Lucky is asking you to mark a cold-call sheet row as called/update its outcome, propose that as a sheet_update.
6. If Lucky is asking you to write or update the sales script (fix an objection, tighten a section, address an open pattern), propose that as a script_proposal — write the FULL updated script as newContent, based on the current master script given to you below plus whatever change he's asking for, not a fragment.

Never claim you can't do 2-6 — propose it properly and let the approval queue handle safety; nothing you draft or propose is ever applied automatically, it lands in a queue on the page for Lucky to approve or reject himself.

An email or lead_update always needs a real lead identified by its lead_id (the exact slug shown in the pipeline data, e.g. "acme-electrical", not the display company name) — if you can't tell which lead he means, ask instead of guessing.

For a lead_update, only these fields exist in "fields", don't invent others: status (must be one of ${VALID_LEAD_STATUSES.join(", ")}), notes (free text — this is added as a new note, not a full replacement), follow_up_at (a date, "YYYY-MM-DD"). Only include the fields Lucky actually asked to change.

For a calendar_booking, "calendar" holds: summary (short title), attendeeEmail, attendeeName (optional), startISO (a real ISO datetime — resolve any relative reference like "Thursday 2pm" using the TODAY line given to you below, in NZ time), durationMinutes (optional, default 30).

For a sheet_update, "sheet" holds: sheetId (the exact sheet_id shown in the COLD-CALL SHEETS context, never invent one — if you don't see the right sheet's id there, say so instead of guessing), company (the exact company name to match in that sheet), and any of dateCalled/outcome/callBack/notes that Lucky wants set. Only include what he actually asked to change.

For a script_proposal, "script" holds: summary (one or two sentences on what changed and why), newContent (the complete script text with the change applied — start from the current master script given to you in SALES CALLS & SCRIPT and edit it, never write a fresh script from scratch or return a partial snippet).

Respond with ONLY a JSON object, no markdown fences, no other text:
{"reply": "your conversational answer, always present", "draft": {"kind": "email" or "note" or "lead_update" or "calendar_booking" or "sheet_update" or "script_proposal", "leadId": "exact lead_id slug, for kind email and lead_update", "subject": "for kind email only, 4-7 words", "title": "for kind note only, short label", "content": "for email: the body as HTML, only <p> and <a> tags. for note: plain text", "fields": {"status"?: "...", "notes"?: "...", "follow_up_at"?: "YYYY-MM-DD"}, "calendar": {"summary": "...", "attendeeEmail": "...", "attendeeName"?: "...", "startISO": "...", "durationMinutes"?: 30}, "sheet": {"sheetId": "...", "company": "...", "dateCalled"?: "...", "outcome"?: "...", "callBack"?: "...", "notes"?: "..."}, "script": {"summary": "...", "newContent": "..."}}}

Only include the one object ("fields", "calendar", "sheet", or "script") that matches the draft's kind — omit the others. Omit "draft" entirely if you're not drafting/proposing anything this turn — most replies won't have one.`;

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
      calendar?: { summary?: string; attendeeEmail?: string; attendeeName?: string; startISO?: string; durationMinutes?: number };
      sheet?: { sheetId?: string; company?: string; dateCalled?: string; outcome?: string; callBack?: string; notes?: string };
      script?: { summary?: string; newContent?: string };
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
  const KNOWN_KINDS = new Set(["email", "note", "lead_update", "calendar_booking", "sheet_update", "script_proposal"]);
  if (draft?.kind && KNOWN_KINDS.has(draft.kind)) {
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
    } else if (draft.kind === "calendar_booking") {
      const cal = draft.calendar || {};
      const start = cal.startISO ? new Date(cal.startISO) : null;
      if (!cal.summary || !cal.attendeeEmail || !start || isNaN(start.getTime()) || start.getTime() < Date.now()) {
        return NextResponse.json({ reply, draftCreated: false, error: "Model proposed a calendar booking with missing/invalid fields — ignored." });
      }
      const payload = {
        summary: stripDashes(cal.summary),
        attendeeEmail: cal.attendeeEmail.trim(),
        attendeeName: cal.attendeeName?.trim() || "",
        startISO: start.toISOString(),
        durationMinutes: cal.durationMinutes || 30,
      };
      const when = start.toLocaleString("en-NZ", { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
      const content = `${payload.summary}\nWith: ${payload.attendeeName || payload.attendeeEmail}\nWhen: ${when} (${payload.durationMinutes} min)`;

      const { error } = await sb.from("chat_drafts").insert({ kind: "calendar_booking", title: payload.summary, content, payload });
      draftCreated = !error;
    } else if (draft.kind === "sheet_update") {
      const sheet = draft.sheet || {};
      if (!sheet.sheetId || !sheet.company?.trim()) {
        return NextResponse.json({ reply, draftCreated: false, error: "Model proposed a sheet update with no sheetId/company — ignored." });
      }
      const { data: tracked } = await sb.from("tracked_sheets").select("sheet_id").eq("sheet_id", sheet.sheetId).eq("active", true).maybeSingle();
      if (!tracked) return NextResponse.json({ reply, draftCreated: false, error: `Model referenced unknown/inactive sheet_id "${sheet.sheetId}" — ignored.` });

      const payload: { sheetId: string; company: string; dateCalled?: string; outcome?: string; callBack?: string; notes?: string } = {
        sheetId: sheet.sheetId,
        company: sheet.company.trim(),
      };
      if (sheet.dateCalled?.trim()) payload.dateCalled = sheet.dateCalled.trim();
      if (sheet.outcome?.trim()) payload.outcome = stripDashes(sheet.outcome.trim());
      if (sheet.callBack?.trim()) payload.callBack = sheet.callBack.trim();
      if (sheet.notes?.trim()) payload.notes = stripDashes(sheet.notes.trim());

      const summaryLines = [
        `Sheet row for ${payload.company}:`,
        payload.dateCalled ? `Date called: ${payload.dateCalled}` : "",
        payload.outcome ? `Outcome: ${payload.outcome}` : "",
        payload.callBack ? `Call back: ${payload.callBack}` : "",
        payload.notes ? `Notes: ${payload.notes}` : "",
      ].filter(Boolean);

      const { error } = await sb.from("chat_drafts").insert({ kind: "sheet_update", title: `Update sheet row: ${payload.company}`, content: summaryLines.join("\n"), payload });
      draftCreated = !error;
    } else if (draft.kind === "script_proposal") {
      const script = draft.script || {};
      if (!script.newContent?.trim()) {
        return NextResponse.json({ reply, draftCreated: false, error: "Model proposed a script change with no content — ignored." });
      }

      // script_proposal writes straight into sales_script_proposals, the
      // same table/queue the automated post-call standing review uses — so
      // it shows up on /dashboard/sales-calls and applying it (a new
      // sales_script_versions row) reuses that existing approval endpoint
      // rather than duplicating the apply logic here.
      const { data: currentVersion } = await sb.from("sales_script_versions").select("version").eq("is_current", true).maybeSingle();
      const { error } = await sb.from("sales_script_proposals").insert({
        call_id: null,
        based_on_version: currentVersion?.version || 0,
        status: "pending",
        needs_changes: true,
        summary: stripDashes(script.summary || "Script update proposed via Brain chat."),
        diffs: [],
        new_content: stripDashes(script.newContent.trim()),
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
