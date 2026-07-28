import { createSupabaseClient } from "@/lib/supabase";
import { sendReminderEmail } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";

// Admin-only (gated by middleware.ts same as the rest of /api/lead-qual) —
// resends the "new job booked" confirmation to the client for a lead that
// already has a calendar booking, for cases where the client's email wasn't
// on file yet at the time it was originally booked (see
// lib/leadQual/onboardingNotify.ts / lq_clients.email auto-fill).
async function handle(id: string) {
  const sb = createSupabaseClient();

  const { data: lead } = await sb
    .from("lq_leads")
    .select("id, client_id, scheduled_at, contact_email, conversation_id")
    .eq("id", id)
    .single();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!lead.scheduled_at) return NextResponse.json({ error: "Lead has no booked slot" }, { status: 400 });

  const [{ data: client }, { data: conversation }] = await Promise.all([
    sb.from("lq_clients").select("email, timezone").eq("id", lead.client_id).single(),
    sb.from("lq_conversations").select("extracted_fields").eq("id", lead.conversation_id).single(),
  ]);
  if (!client?.email) return NextResponse.json({ error: "Client has no email on file" }, { status: 400 });

  const fields = (conversation?.extracted_fields || {}) as Record<string, string>;
  const timezone = client.timezone || "Pacific/Auckland";
  const scheduled = new Date(lead.scheduled_at);

  // Older bookings (before the callback-only fix) booked the visit_time
  // itself onto the calendar rather than the callback — labelling it
  // "Callback" for those would misdescribe what's actually on the calendar,
  // so figure out which one this slot actually matches.
  const isVisitSlot = fields.visit_time_iso && Math.abs(new Date(fields.visit_time_iso + "Z").getTime() - scheduled.getTime()) < 5 * 60 * 1000;
  const label = isVisitSlot ? "Site visit" : "Callback";

  const slotLabel = new Intl.DateTimeFormat("en-NZ", {
    timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  }).format(scheduled);

  await sendReminderEmail(
    client.email,
    `New job booked: ${fields.job_type || "Job"} — ${slotLabel}`,
    `You've got a new job booked in from your Messenger chat.\n\n` +
    `Job: ${fields.job_type || "Not specified"}\n` +
    `Location: ${fields.location || "Not specified"}\n` +
    `${label} booked for: ${slotLabel}\n` +
    `${fields.phone ? `Their number: ${fields.phone}\n` : ""}` +
    `${isVisitSlot && fields.callback_time ? `They also asked for a quick call at: ${fields.callback_time} — worth checking whether that already happened.\n` : ""}` +
    `${!isVisitSlot && fields.visit_time ? `They asked for someone to come round: ${fields.visit_time} — this isn't locked in, confirm it works for you on the call first.\n` : ""}` +
    `\nGive them a call to sort the quote${isVisitSlot ? "" : " and confirm a visit time that actually works for you"}.`
  );

  return NextResponse.json({ ok: true, sentTo: client.email, slotLabel, label });
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(id);
}

// GET too, so it can be triggered by just clicking a link in the browser
// while logged into the admin dashboard, not only via a fetch() call.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(id);
}
