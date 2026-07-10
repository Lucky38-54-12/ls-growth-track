import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { sendFreeformEmail } from "@/lib/email";
import { statusTimestampUpdates } from "@/lib/leads";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("onboarding_clients")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const { name, company, email, phone, subject, bodyHtml, decisionStatus, callNotes } = body;

  const { data, error } = await sb
    .from("onboarding_clients")
    .insert({
      name, company, email: email || null, phone: phone || null,
      decision_status: decisionStatus === "thinking" ? "thinking" : "ready",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = false;
  let sendError = "";
  if (email && subject && bodyHtml) {
    try {
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">${bodyHtml}<p>Cheers,<br>Lucky<br>LS Growth</p></div>`;
      await sendFreeformEmail(email, subject, html);
      sent = true;
    } catch (e) {
      sendError = e instanceof Error ? e.message : "Send failed";
    }
  }

  // A recap almost always covers a lead that's already sitting in the
  // cold-call/email pipeline — mirror the decision there so the board
  // doesn't go stale once onboarding takes over, and drop the recap into
  // the lead's notes so it shows up on its pipeline card.
  let leadSynced = false;
  if (email) {
    const { data: lead } = await sb.from("leads").select("lead_id, notes").ilike("email", email).maybeSingle();
    if (lead) {
      const pipelineStatus = decisionStatus === "thinking" ? "thinking_about_it" : "proposal_sent";
      const updates: Record<string, unknown> = { status: pipelineStatus, ...statusTimestampUpdates(pipelineStatus) };
      if (callNotes?.trim()) {
        const today = new Date().toISOString().split("T")[0];
        const entry = `[${today} onboarding recap] ${callNotes.trim()}`;
        updates.notes = lead.notes?.trim() ? `${lead.notes}\n${entry}` : entry;
      }
      const { error: updateError } = await sb.from("leads").update(updates).eq("lead_id", lead.lead_id);
      leadSynced = !updateError;
    }
  }

  return NextResponse.json({ ...data, sent, sendError, leadSynced });
}
