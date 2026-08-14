import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseClient } from "@/lib/supabase";
import { withWritingStyle, parseJsonResponse, stripDashes } from "@/lib/ai";
import { buildBrainContext } from "@/lib/brainContext";
import { buildAttachmentBlocks } from "@/lib/brainDocuments";
import { BrainAttachment, MAX_ATTACHMENTS_PER_MESSAGE } from "@/lib/brainAttachments";
import { createDocFromMarkedText } from "@/lib/googleDocs";
import { logSalesCall } from "@/lib/logSalesCall";
import { prepSalesCall } from "@/lib/prepSalesCall";
import { generateAndSaveCampaignBrief } from "@/lib/campaignBrief";
import { LeadStatus } from "@/lib/types";

const VALID_LEAD_STATUSES: readonly LeadStatus[] = [
  "not_contacted", "contacted", "followup_1_sent", "followup_2_sent", "followup_3_sent", "followup_4_sent",
  "replied", "booked", "not_interested", "bounced", "sequence_complete", "reenroll_queue", "no_show",
  "rebooked", "proposal_sent", "closed", "no_close", "thinking_about_it", "discovery_done",
];

export const dynamic = "force-dynamic";
// 60s wasn't enough for call_prep/agreement_doc specifically — those run a
// second full Claude call (generateCallPrep, up to 16k tokens, with its own
// fallback model) plus several sequential Google Docs/Drive API calls after
// the main turn already completed, and can legitimately take over a minute
// with nothing actually wrong. 180s gives that pipeline real headroom.
export const maxDuration = 180;

interface ParsedDraft {
  kind?: string; leadId?: string; subject?: string; title?: string; content?: string;
  fields?: { status?: string; notes?: string; follow_up_at?: string };
  calendar?: { summary?: string; attendeeEmail?: string; attendeeName?: string; startISO?: string; durationMinutes?: number };
  sheet?: { sheetId?: string; company?: string; dateCalled?: string; outcome?: string; callBack?: string; notes?: string };
  script?: { summary?: string; newContent?: string };
  agreement?: { title?: string; markedText?: string };
  call?: { rawSummary?: string; yourTake?: string };
  callPrep?: { notes?: string };
  campaignBrief?: { clientId?: string };
}

const BRAIN_SYSTEM_PROMPT = `You are Lucky's business brain for LS Growth Agency — a single place he asks questions about the business and gets you to draft things, instead of digging through Supabase, Gmail, or Google Docs himself.

You'll be given, below your own instructions: how LS Growth operates (Agency Brain), a live snapshot of the lead pipeline, any leads matching this question by company or contact name, the status of running automations, any Google Docs a live search found relevant to his question, what's on his Calendar from 3 days ago through the next 7 (including meetings that already happened), the cold-call Sheets that are tracked (with called/not-called counts for any that match his question), any inbox emails matching his question by subject, Meta Ads campaign performance for the last 30 days, his sales calls log plus the current master sales script and any open recurring patterns the script hasn't fixed yet, and campaign/revenue status. Use whatever is actually relevant, ignore the rest.

Before asking Lucky who someone is, actually check what you were given: LEADS MATCHING THIS QUESTION matches by contact name as well as company, and CALENDAR includes recent past meetings with attendee names, so a first name he mentions right after meeting someone (e.g. "what did Ray say today") will very often already be sitting in one of those sections. Only say you don't know who someone is after actually checking both, not by default.

Lucky can also attach files (PDFs, images, text) directly to a message — when he does, they appear as real document/image content right above his message text in this turn, already provided in full, not something to fetch or ask for. Read them and use them like anything else given to you: answer questions about them, pull real numbers/names/quotes from them, or use them as the source when he asks you to draft something. Never claim you can't see an attached file.

You can do ten things:
1. Just answer the question, conversationally, like a sharp operator who actually knows the business.
2. If Lucky is asking you to draft something (a follow-up email to a specific lead, or a note/plan for something else), write the actual draft — never claim you can't draft things.
3. If Lucky is asking you to change a real lead record (its status, add a note, set a follow-up date), propose that as a lead_update.
4. If Lucky is asking you to book a meeting, propose that as a calendar_booking.
5. If Lucky is asking you to mark a cold-call sheet row as called/update its outcome, propose that as a sheet_update.
6. If Lucky is asking you to write or update the sales script (fix an objection, tighten a section, address an open pattern), propose that as a script_proposal — write the FULL updated script as newContent, based on the current master script given to you below plus whatever change he's asking for, not a fragment.
7. If Lucky gives you the details of a deal he just closed or agreed (client name, price, terms, whatever came up on the call) and wants an agreement/contract drafted, propose that as agreement_doc — this actually creates a real new Google Doc immediately (not queued for approval, since nothing is sent anywhere), and the link goes straight back to him in your reply.
8. If Lucky pastes a raw notetaker summary/transcript of a sales call (with or without also saying "log this call"), propose that as log_call — this is the same thing the old "Log a Call" page did: parses it, saves the real call record immediately, and runs the standing script review against every logged call, which may itself raise a script_proposal on top. Recognize this pattern yourself — a pasted block that reads like a call transcript/summary (a conversation between him and a prospect, an outcome, objections) is log_call even if he doesn't explicitly say "log this call".
9. If Lucky asks you to prep him for an upcoming call (whether or not he gives you notes on the prospect), propose that as call_prep — this is the same thing the old "Call Prep" tab did: generates a tailored call sheet off the master script and his recent patterns, creates it as a real Google Doc immediately, and the link goes straight back to him in your reply.
10. If Lucky asks you to set up a campaign, or start/build a campaign strategy, for one of his onboarded clients (usually right after they've been onboarded), propose that as campaign_brief — this researches that client's local market (competitors, typical pricing, what's working on Meta for that trade) and writes a Stage 01 STRATEGY brief (offer & pricing, main service, ideal customer, service area, job value/margins, competitor research, objective, budget, targeting approach, lead qualification criteria, retargeting strategy), saves it, and the link to review/edit it on /dashboard/campaign-setup goes straight back to him in your reply. This is research and a saved doc only — it does not touch Ads Manager or spend any money.

Never claim you can't do 2-10 — propose it properly; script_proposal, agreement_doc, log_call, call_prep, and campaign_brief apply immediately since none of them send anything externally and are all easy to correct after the fact, everything else lands in a queue on the page for Lucky to approve or reject himself.

You are NOT limited to one action per turn — "drafts" is a list, and a single message often genuinely calls for more than one of the above at once. The clearest case: Lucky pastes a call transcript that also states the deal he just closed on that call ("here's the call... we agreed $X/month, starting Monday") — that is BOTH a log_call (the transcript) AND an agreement_doc (the agreed terms) in the same turn, and you should propose both rather than picking one and hoping he asks for the other separately. Same logic anywhere else two of these genuinely both apply from what he actually gave you. Don't force a second action that isn't actually supported by anything he said — this is about not missing an obvious second action, not padding the list.

An email or lead_update always needs a real lead identified by its lead_id (the exact slug shown in the pipeline data, e.g. "acme-electrical", not the display company name) — if you can't tell which lead he means, ask instead of guessing.

For a lead_update, only these fields exist in "fields", don't invent others: status (must be one of ${VALID_LEAD_STATUSES.join(", ")}), notes (free text — this is added as a new note, not a full replacement), follow_up_at (a date, "YYYY-MM-DD"). Only include the fields Lucky actually asked to change.

For a calendar_booking, "calendar" holds: summary (short title), attendeeEmail, attendeeName (optional), startISO (a real ISO datetime — resolve any relative reference like "Thursday 2pm" using the TODAY line given to you below, in NZ time), durationMinutes (optional, default 30).

For a sheet_update, "sheet" holds: sheetId (the exact sheet_id shown in the COLD-CALL SHEETS context, never invent one — if you don't see the right sheet's id there, say so instead of guessing), company (the exact company name to match in that sheet), and any of dateCalled/outcome/callBack/notes that Lucky wants set. Only include what he actually asked to change.

For a script_proposal, "script" holds: summary (one or two sentences on what changed and why), newContent (the complete script text with the change applied — start from the current master script given to you in SALES CALLS & SCRIPT and edit it, never write a fresh script from scratch or return a partial snippet).

For an agreement_doc, "agreement" holds: title (e.g. "LS Growth Agreement — Acme Electrical"), markedText (the full document, written in the AGREEMENT TEMPLATE's own structure and wording given to you below, with only the deal-specific details — client/business name, price, terms, dates, whatever Lucky told you was agreed — filled in or changed. Mark it up exactly like the template: "# " for the title line only, "## " for each section heading, plain text for everything else, no other markdown, no asterisks). If Lucky hasn't actually given you the deal specifics yet, ask for them instead of inventing placeholder values — never fabricate a price, date, or term that wasn't actually said. If no AGREEMENT TEMPLATE was given to you below, say you don't have the template loaded instead of writing one from scratch.

For a log_call, "call" holds: rawSummary (the raw notes/transcript Lucky pasted, copied verbatim, word for word — never summarize or clean it up yourself, the real parsing happens after this), yourTake (Lucky's own honest read of the call — where he mucked up, what he'd change — ONLY if he actually wrote that himself somewhere in his message, separate from the pasted transcript; leave it "" if he only pasted the transcript with nothing of his own added, never invent this on his behalf).

For a call_prep, "callPrep" holds: notes (everything Lucky told you about the upcoming prospect — business name, contact, services, pain points, anything he pasted or described — as one freeform block, in his own words/whatever he gave you, not reformatted. Leave it "" if he asked for a prep without giving you anything on the prospect yet, that's fine, the prep just comes out more generic).

For a campaign_brief, "campaignBrief" holds: clientId (the exact client_id UUID shown in ONBOARDED CLIENTS below — match it by the name Lucky gave you, never invent one or use a lead_id from the pipeline instead. If you can't tell which client he means, or he hasn't onboarded one by that name yet, ask instead of guessing).

Respond with ONLY a JSON object, no markdown fences, no other text:
{"reply": "your conversational answer, always present", "drafts": [{"kind": "email" or "note" or "lead_update" or "calendar_booking" or "sheet_update" or "script_proposal" or "agreement_doc" or "log_call" or "call_prep" or "campaign_brief", "leadId": "exact lead_id slug, for kind email and lead_update", "subject": "for kind email only, 4-7 words", "title": "for kind note only, short label", "content": "for email: the body as HTML, only <p> and <a> tags. for note: plain text", "fields": {"status"?: "...", "notes"?: "...", "follow_up_at"?: "YYYY-MM-DD"}, "calendar": {"summary": "...", "attendeeEmail": "...", "attendeeName"?: "...", "startISO": "...", "durationMinutes"?: 30}, "sheet": {"sheetId": "...", "company": "...", "dateCalled"?: "...", "outcome"?: "...", "callBack"?: "...", "notes"?: "..."}, "script": {"summary": "...", "newContent": "..."}, "agreement": {"title": "...", "markedText": "..."}, "call": {"rawSummary": "...", "yourTake": "..."}, "callPrep": {"notes": "..."}, "campaignBrief": {"clientId": "..."}}]}

Each entry in "drafts" only includes the one object ("fields", "calendar", "sheet", "script", "agreement", "call", "callPrep", or "campaignBrief") that matches its own kind — omit the others. "drafts" is "[]" (empty array) if you're not drafting/proposing anything this turn — most replies won't have one. Only put more than one entry in "drafts" when the message genuinely supports more than one action (see above) — most turns that do have one will still only have one.`;

// Applies whatever the model proposed (if anything) and returns the final
// reply text plus whether a draft/action actually landed. Kept separate
// from POST so every code path funnels through one return. POST now calls
// this once per entry in the model's "drafts" array (see BRAIN_SYSTEM_PROMPT
// — a single turn can propose more than one action, e.g. a pasted call that
// also states agreed deal terms is both log_call and agreement_doc), and
// concatenates each result's appendText onto the model's own reply text.
async function resolveDraft(
  sb: ReturnType<typeof createSupabaseClient>,
  draft: ParsedDraft
): Promise<{ appendText: string; draftCreated: boolean; error?: string }> {
  const KNOWN_KINDS = new Set(["email", "note", "lead_update", "calendar_booking", "sheet_update", "script_proposal", "agreement_doc", "log_call", "call_prep", "campaign_brief"]);
  if (!draft.kind || !KNOWN_KINDS.has(draft.kind)) return { appendText: "", draftCreated: false, error: draft.kind ? `Model proposed an unknown draft kind "${draft.kind}" — ignored.` : undefined };

  let leadUuid: string | null = null;
  if (draft.kind === "email" || draft.kind === "lead_update") {
    if (!draft.leadId) return { appendText: "", draftCreated: false, error: `Model tried to ${draft.kind === "email" ? "draft an email" : "update a lead"} with no lead_id — ignored.` };
    const { data: lead } = await sb.from("leads").select("id").eq("lead_id", draft.leadId).maybeSingle();
    if (!lead) return { appendText: "", draftCreated: false, error: `Model referenced unknown lead_id "${draft.leadId}" — ignored.` };
    leadUuid = lead.id;
  }

  if (draft.kind === "lead_update") {
    const fields = draft.fields || {};
    const payload: { status?: LeadStatus; notes?: string; follow_up_at?: string } = {};
    if (fields.status && (VALID_LEAD_STATUSES as readonly string[]).includes(fields.status)) payload.status = fields.status as LeadStatus;
    if (fields.notes?.trim()) payload.notes = stripDashes(fields.notes.trim());
    if (fields.follow_up_at?.trim()) payload.follow_up_at = fields.follow_up_at.trim();

    if (Object.keys(payload).length === 0) {
      return { appendText: "", draftCreated: false, error: "Model proposed a lead update with no valid fields — ignored." };
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
    return { appendText: "", draftCreated: !error };
  }

  if (draft.kind === "calendar_booking") {
    const cal = draft.calendar || {};
    const start = cal.startISO ? new Date(cal.startISO) : null;
    if (!cal.summary || !cal.attendeeEmail || !start || isNaN(start.getTime()) || start.getTime() < Date.now()) {
      return { appendText: "", draftCreated: false, error: "Model proposed a calendar booking with missing/invalid fields — ignored." };
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
    return { appendText: "", draftCreated: !error };
  }

  if (draft.kind === "sheet_update") {
    const sheet = draft.sheet || {};
    if (!sheet.sheetId || !sheet.company?.trim()) {
      return { appendText: "", draftCreated: false, error: "Model proposed a sheet update with no sheetId/company — ignored." };
    }
    const { data: tracked } = await sb.from("tracked_sheets").select("sheet_id").eq("sheet_id", sheet.sheetId).eq("active", true).maybeSingle();
    if (!tracked) return { appendText: "", draftCreated: false, error: `Model referenced unknown/inactive sheet_id "${sheet.sheetId}" — ignored.` };

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
    return { appendText: "", draftCreated: !error };
  }

  if (draft.kind === "script_proposal") {
    const script = draft.script || {};
    if (!script.newContent?.trim()) {
      return { appendText: "", draftCreated: false, error: "Model proposed a script change with no content — ignored." };
    }

    // script_proposal writes straight into sales_script_proposals, the same
    // table/queue the automated post-call standing review uses — so it
    // shows up on /dashboard/sales-calls and applying it (a new
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
    return { appendText: "", draftCreated: !error };
  }

  if (draft.kind === "agreement_doc") {
    const agreement = draft.agreement || {};
    if (!agreement.markedText?.trim()) {
      return { appendText: "", draftCreated: false, error: "Model tried to create an agreement doc with no content — ignored." };
    }

    // Creates the real Google Doc immediately rather than queuing it for
    // approval — nothing is sent to anyone, it's a private doc only Lucky
    // can see, same reasoning as the existing call-prep doc creation.
    try {
      const url = await createDocFromMarkedText(agreement.title || "Client Agreement", agreement.markedText.trim());
      return { appendText: `\n\nAgreement doc created: ${url}`, draftCreated: false };
    } catch (e) {
      return { appendText: "", draftCreated: false, error: e instanceof Error ? e.message : "Failed to create the agreement doc." };
    }
  }

  if (draft.kind === "log_call") {
    const callInput = draft.call || {};
    if (!callInput.rawSummary?.trim()) {
      return { appendText: "", draftCreated: false, error: "Model tried to log a call with no transcript — ignored." };
    }

    // Same real-write-immediately reasoning as script_proposal/agreement_doc
    // above — logging a call is just data entry, easily corrected after the
    // fact, and shares its actual logic with the "Log a Call" page via
    // lib/logSalesCall.ts rather than duplicating it here.
    try {
      const { call, proposal } = await logSalesCall(sb, callInput.rawSummary.trim(), callInput.yourTake?.trim() || "");
      const outcomeLine = `Logged: ${call.prospect_name || "unknown prospect"} (${call.business_name || "unknown business"}), ${call.call_date}, outcome ${call.outcome}.`;
      const proposalLine = proposal ? `\n\nThe standing script review also flagged something — a script_proposal is waiting on /dashboard/sales-calls: ${proposal.summary}` : "";
      return { appendText: `\n\n${outcomeLine}${proposalLine}`, draftCreated: false };
    } catch (e) {
      return { appendText: "", draftCreated: false, error: e instanceof Error ? e.message : "Failed to log that call." };
    }
  }

  if (draft.kind === "call_prep") {
    const callPrep = draft.callPrep || {};

    // Same shared-logic reasoning as log_call — lib/prepSalesCall.ts is the
    // exact function the "Call Prep" tab's generate button calls, then the
    // doc gets created the same way that tab's "Create Doc" button does.
    try {
      const prep = await prepSalesCall(sb, callPrep.notes?.trim() || "");
      const title = `Call Prep — ${prep.businessName || prep.prospectName || "Prospect"}`;
      const url = await createDocFromMarkedText(title, prep.tailoredScript);
      const workOnsLine = prep.topWorkOns.length ? `\nWatch yourself on: ${prep.topWorkOns.join("; ")}` : "";
      const objectionsLine = prep.likelyObjections.length ? `\nLikely objections: ${prep.likelyObjections.join("; ")}` : "";
      return { appendText: `\n\nPrep doc created: ${url}${workOnsLine}${objectionsLine}`, draftCreated: false };
    } catch (e) {
      return { appendText: "", draftCreated: false, error: e instanceof Error ? e.message : "Failed to generate the call prep." };
    }
  }

  if (draft.kind === "campaign_brief") {
    const campaignBrief = draft.campaignBrief || {};
    if (!campaignBrief.clientId) {
      return { appendText: "", draftCreated: false, error: "Model tried to set up a campaign brief with no client_id — ignored." };
    }
    const { data: client } = await sb.from("lq_clients").select("id, name").eq("id", campaignBrief.clientId).maybeSingle();
    if (!client) return { appendText: "", draftCreated: false, error: `Model referenced unknown client_id "${campaignBrief.clientId}" — ignored.` };

    // Same real-write-immediately reasoning as call_prep/log_call — this is
    // research plus a saved doc, nothing external, easily regenerated or
    // edited afterwards on /dashboard/campaign-setup.
    try {
      const brief = await generateAndSaveCampaignBrief(client.id);
      const summaryLine = `Objective: ${brief.objective || "n/a"}. Budget: ${brief.budget || "n/a"}.`;
      return { appendText: `\n\nCampaign strategy brief created for ${client.name}. ${summaryLine}\n\nReview/edit it: /dashboard/campaign-setup`, draftCreated: false };
    } catch (e) {
      return { appendText: "", draftCreated: false, error: e instanceof Error ? e.message : "Failed to generate the campaign brief." };
    }
  }

  const { error } = await sb.from("chat_drafts").insert({
    kind: draft.kind,
    title: draft.kind === "email" ? stripDashes(draft.subject || "Follow-up") : (draft.title || "Note"),
    lead_id: leadUuid,
    content: stripDashes(draft.content || ""),
  });
  return { appendText: "", draftCreated: !error };
}

// Persists both sides of the turn to brain_messages so old threads survive a
// refresh and can be reopened (see supabase_migration_brain_conversations.sql).
// The title is set from the first user message once, then left alone.
async function persistTurn(
  sb: ReturnType<typeof createSupabaseClient>,
  conversationId: string,
  userMessage: string,
  attachmentNames: string[],
  assistantReply: string
) {
  await sb.from("brain_messages").insert([
    { conversation_id: conversationId, role: "user", content: userMessage, attachment_names: attachmentNames },
    { conversation_id: conversationId, role: "assistant", content: assistantReply, attachment_names: [] },
  ]);

  const { data: convo } = await sb.from("brain_conversations").select("title").eq("id", conversationId).maybeSingle();
  const updates: { updated_at: string; title?: string } = { updated_at: new Date().toISOString() };
  if (!convo?.title || convo.title === "New chat") {
    updates.title = userMessage.slice(0, 60) + (userMessage.length > 60 ? "…" : "");
  }
  await sb.from("brain_conversations").update(updates).eq("id", conversationId);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY_BRAIN || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY_BRAIN not set" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const attachments: BrainAttachment[] = Array.isArray(body.attachments) ? body.attachments.slice(0, MAX_ATTACHMENTS_PER_MESSAGE) : [];
  const message: string = (body.message || "").trim() || (attachments.length ? "Take a look at the attached file(s)." : "");
  if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });

  const sb = createSupabaseClient();

  let conversationId: string = body.conversationId || "";
  if (!conversationId) {
    const { data: created, error } = await sb.from("brain_conversations").insert({ title: "New chat" }).select("id").single();
    if (error || !created) return NextResponse.json({ error: "Could not start a new conversation." }, { status: 500 });
    conversationId = created.id;
  }

  const { data: priorRows } = await sb
    .from("brain_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  const history = (priorRows || []) as { role: "user" | "assistant"; content: string }[];

  const [systemPrompt, contextBlock, attachmentBlocks] = await Promise.all([
    withWritingStyle(BRAIN_SYSTEM_PROMPT),
    buildBrainContext(message),
    buildAttachmentBlocks(attachments).catch(() => []),
  ]);

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: `${systemPrompt}\n\n---\n\n${contextBlock}`,
    messages: [
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user" as const, content: [...attachmentBlocks, { type: "text" as const, text: message }] },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return NextResponse.json({ conversationId, error: "No response from Claude" }, { status: 502 });

  let parsed: { reply?: string; drafts?: ParsedDraft[] };
  try {
    parsed = parseJsonResponse(textBlock.text);
  } catch {
    // Fall back to the raw text as a plain reply rather than dropping the turn.
    const rawReply = textBlock.text.trim();
    await persistTurn(sb, conversationId, message, attachments.map((a) => a.name), rawReply);
    return NextResponse.json({ conversationId, reply: rawReply, draftCreated: false });
  }

  const drafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];
  const results = await Promise.all(drafts.map((d) => resolveDraft(sb, d)));

  const reply = stripDashes(parsed.reply || textBlock.text.trim()) + results.map((r) => r.appendText).join("");
  const draftCreated = results.some((r) => r.draftCreated);
  const errors = results.map((r) => r.error).filter((e): e is string => !!e);

  await persistTurn(sb, conversationId, message, attachments.map((a) => a.name), reply);

  return NextResponse.json({ conversationId, reply, draftCreated, error: errors.length ? errors.join(" ") : undefined });
}
