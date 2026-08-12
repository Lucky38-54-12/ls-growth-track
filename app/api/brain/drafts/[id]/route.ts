import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { sendGmailFollowup } from "@/lib/email";
import { statusTimestampUpdates } from "@/lib/leads";
import { createBooking } from "@/lib/calendar";
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

    try {
      await sendGmailFollowup(lead as Lead, draft.title || "Follow-up", draft.content, "brain_draft");
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

  const { data: updated, error: updateError } = await sb.from("chat_drafts")
    .update({ status: "approved", decided_at: new Date().toISOString() })
    .eq("id", params.id).select().single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  await recordLearningFromDecision(sb, { kind: draft.kind, content: draft.content, decision: "approved", reason });
  return NextResponse.json({ draft: updated });
}
