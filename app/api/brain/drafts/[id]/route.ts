import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { sendGmailFollowup } from "@/lib/email";
import { statusTimestampUpdates } from "@/lib/leads";
import { createBooking, findUpcomingEventsByQuery, rescheduleBooking, fillMeetingLink } from "@/lib/calendar";
import { findSheetRowByCompany, getRawRange, updateSheetCell } from "@/lib/sheets-connector";
import { recordLearningFromDecision } from "@/lib/brainLearnings";
import { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const decision = body.decision;
  const reason: string | undefined = typeof body.reason === "string" ? body.reason : undefined;

  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json({ error: "decision must be 'approved' or 'rejected'." }, { status: 400 });
  }

  const { data: draft, error: draftError } = await sb.from("chat_drafts").select("*").eq("id", params.id).maybeSingle();
  if (draftError) return NextResponse.json({ error: draftError.message }, { status: 500 });
  if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  if (draft.status !== "pending") return NextResponse.json({ error: "This draft has already been decided." }, { status: 400 });

  if (decision === "rejected") {
    const { data, error } = await sb.from("chat_drafts")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .eq("id", params.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await recordLearningFromDecision(sb, { kind: draft.kind, content: draft.content, decision: "rejected", reason });
    return NextResponse.json({ draft: data });
  }

  // Approved. An email draft with a lead attached actually sends through the
  // real follow-up pipeline (same path as the manual cold-call follow-up
  // send) so approval here isn't just a status flip — it's the real send.
  // Anything else (a note, or an email that somehow lost its lead) has
  // nowhere automated to go yet, so it's just marked approved for Lucky to
  // action by hand.
  if (draft.kind === "email" && draft.lead_id) {
    const { data: lead, error: leadError } = await sb.from("leads").select("*").eq("id", draft.lead_id).maybeSingle();
    if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 });
    if (!lead) return NextResponse.json({ error: "The lead this draft was written for no longer exists." }, { status: 400 });

    // Swaps the model's literal "[MEETING LINK]" placeholder (see
    // BRAIN_SYSTEM_PROMPT in app/api/brain/chat/route.ts) for the one fixed
    // Google Meet room this business always uses — same helper the cold-call
    // follow-up pipeline already relies on (app/api/leads/[id]/followup and
    // lib/calendarSync.ts). Done here at send-time, not at draft-creation
    // time, so it's the value actually in the env right when the email goes
    // out. No-op (leaves the placeholder untouched) if GOOGLE_MEET_LINK
    // isn't set.
    const finalContent = fillMeetingLink(draft.content, process.env.GOOGLE_MEET_LINK || "");

    try {
      await sendGmailFollowup(lead as Lead, draft.title || "Follow-up", finalContent, "brain_draft");
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to send email." }, { status: 502 });
    }

    const { data: updated, error: updateError } = await sb.from("chat_drafts")
      .update({ status: "sent", decided_at: new Date().toISOString() })
      .eq("id", params.id).select().single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    await recordLearningFromDecision(sb, { kind: draft.kind, content: draft.content, decision: "approved", reason });
    return NextResponse.json({ draft: updated });
  }

  // A lead_update draft actually writes to the real lead row on approval —
  // same "approval is the real action" principle as the email kind above.
  // Notes are appended (dated), never overwrite what's already there.
  if (draft.kind === "lead_update" && draft.lead_id) {
    const { data: lead, error: leadError } = await sb.from("leads").select("id, notes, status").eq("id", draft.lead_id).maybeSingle();
    if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 });
    if (!lead) return NextResponse.json({ error: "The lead this update was proposed for no longer exists." }, { status: 400 });

    const payload = (draft.payload || {}) as { status?: string; notes?: string; follow_up_at?: string };
    const leadUpdate: Record<string, unknown> = {};
    if (payload.status) Object.assign(leadUpdate, { status: payload.status, ...statusTimestampUpdates(payload.status) });
    if (payload.notes) {
      const dated = `[${new Date().toISOString().split("T")[0]}] ${payload.notes}`;
      leadUpdate.notes = lead.notes ? `${lead.notes}\n${dated}` : dated;
    }
    if (payload.follow_up_at) leadUpdate.follow_up_at = payload.follow_up_at;

    const { error: applyError } = await sb.from("leads").update(leadUpdate).eq("id", draft.lead_id);
    if (applyError) return NextResponse.json({ error: applyError.message }, { status: 500 });

    const { data: updated, error: updateError } = await sb.from("chat_drafts")
      .update({ status: "applied", decided_at: new Date().toISOString() })
      .eq("id", params.id).select().single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    await recordLearningFromDecision(sb, { kind: draft.kind, content: draft.content, decision: "approved", reason });
    return NextResponse.json({ draft: updated });
  }

  // A calendar_booking draft creates the real event on approval.
  if (draft.kind === "calendar_booking") {
    const payload = (draft.payload || {}) as { summary: string; attendeeEmail: string; attendeeName?: string; startISO: string; durationMinutes?: number };
    try {
      await createBooking(payload);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to create the calendar event." }, { status: 502 });
    }

    const { data: updated, error: updateError } = await sb.from("chat_drafts")
      .update({ status: "applied", decided_at: new Date().toISOString() })
      .eq("id", params.id).select().single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    await recordLearningFromDecision(sb, { kind: draft.kind, content: draft.content, decision: "approved", reason });
    return NextResponse.json({ draft: updated });
  }

  // A reschedule_booking draft moves the real event on approval. The event
  // is re-found by the same query right now, same "never trust a proposal-
  // time lookup" reasoning as sheet_update's row re-location below — it may
  // have moved again, or been cancelled, in the time since this was proposed.
  if (draft.kind === "reschedule_booking") {
    const payload = (draft.payload || {}) as { query: string; startISO: string; durationMinutes?: number };
    try {
      const matches = await findUpcomingEventsByQuery(payload.query);
      if (matches.length === 0) {
        return NextResponse.json({ error: `Couldn't find an upcoming event matching "${payload.query}" anymore — it may have moved or been cancelled. Nothing was changed.` }, { status: 400 });
      }
      await rescheduleBooking({ eventId: matches[0].eventId, startISO: payload.startISO, durationMinutes: payload.durationMinutes });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to reschedule the event." }, { status: 502 });
    }

    const { data: updated, error: updateError } = await sb.from("chat_drafts")
      .update({ status: "applied", decided_at: new Date().toISOString() })
      .eq("id", params.id).select().single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    await recordLearningFromDecision(sb, { kind: draft.kind, content: draft.content, decision: "approved", reason });
    return NextResponse.json({ draft: updated });
  }

  // A sheet_update draft writes to the real Google Sheet on approval. The
  // row is re-located right now (never trusting a row index computed when
  // the draft was proposed) and only the columns Lucky actually asked to
  // change are overwritten — the rest of that row's F:I values are read
  // first and carried through untouched.
  if (draft.kind === "sheet_update") {
    const payload = (draft.payload || {}) as { sheetId: string; company: string; dateCalled?: string; outcome?: string; callBack?: string; notes?: string };
    try {
      const row = await findSheetRowByCompany(payload.sheetId, payload.company);
      if (row === null) {
        return NextResponse.json({ error: `Couldn't find "${payload.company}" in that sheet anymore — it may have moved or been removed. Nothing was changed.` }, { status: 400 });
      }
      const [current] = await getRawRange(payload.sheetId, `F${row}:I${row}`);
      const [curDateCalled, curOutcome, curCallBack, curNotes] = current || [];
      const nextRow = [
        payload.dateCalled ?? curDateCalled ?? "",
        payload.outcome ?? curOutcome ?? "",
        payload.callBack ?? curCallBack ?? "",
        payload.notes ?? curNotes ?? "",
      ];
      await updateSheetCell(payload.sheetId, `F${row}:I${row}`, [nextRow]);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to update the sheet." }, { status: 502 });
    }

    const { data: updated, error: updateError } = await sb.from("chat_drafts")
      .update({ status: "applied", decided_at: new Date().toISOString() })
      .eq("id", params.id).select().single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    await recordLearningFromDecision(sb, { kind: draft.kind, content: draft.content, decision: "approved", reason });
    return NextResponse.json({ draft: updated });
  }

  // An ad_learning draft writes the real ad_learnings row on approval — same
  // "approval is the real action" principle as lead_update/sheet_update
  // above. This is the only write into that table anywhere in the app; the
  // model only ever queues a proposal (see app/api/brain/chat/route.ts).
  if (draft.kind === "ad_learning") {
    const payload = (draft.payload || {}) as {
      clientId: string; service: string | null; angle: string | null; creative: string | null; offer: string | null;
      observed: string; inference: string | null; nextTest: string | null; confidence: string;
      segment?: string | null; hook?: string | null; format?: string | null; headline?: string | null;
      primaryText?: string | null; cta?: string | null; visualDirection?: string | null; hypothesis?: string | null;
      priority?: string | null; priorityReason?: string | null;
    };
    const { error: insertError } = await sb.from("ad_learnings").insert({
      client_id: payload.clientId,
      service: payload.service,
      angle: payload.angle,
      creative: payload.creative,
      offer: payload.offer,
      observed: payload.observed,
      inference: payload.inference,
      next_test: payload.nextTest,
      confidence: payload.confidence,
      segment: payload.segment ?? null,
      hook: payload.hook ?? null,
      format: payload.format ?? null,
      headline: payload.headline ?? null,
      primary_text: payload.primaryText ?? null,
      cta: payload.cta ?? null,
      visual_direction: payload.visualDirection ?? null,
      hypothesis: payload.hypothesis ?? null,
      priority: payload.priority ?? null,
      priority_reason: payload.priorityReason ?? null,
    });
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    const { data: updated, error: updateError } = await sb.from("chat_drafts")
      .update({ status: "applied", decided_at: new Date().toISOString() })
      .eq("id", params.id).select().single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    await recordLearningFromDecision(sb, { kind: draft.kind, content: draft.content, decision: "approved", reason });
    return NextResponse.json({ draft: updated });
  }

  const { data: updated, error: updateError } = await sb.from("chat_drafts")
    .update({ status: "approved", decided_at: new Date().toISOString() })
    .eq("id", params.id).select().single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  await recordLearningFromDecision(sb, { kind: draft.kind, content: draft.content, decision: "approved", reason });
  return NextResponse.json({ draft: updated });
}
