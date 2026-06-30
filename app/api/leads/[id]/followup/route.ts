import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { createSupabaseClient } from "@/lib/supabase";
import { sendPersonalizedEmail, sendGmailFollowup } from "@/lib/email";
import { createBooking, fillMeetingLink } from "@/lib/calendar";
import { Lead } from "@/lib/types";
import { generateCallFollowupEmail } from "@/lib/generateCallEmail";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { callNotes, subject, bodyHtml, status, meetingDateTime } = body as {
    callNotes?: string;
    subject?: string;
    bodyHtml?: string;
    status?: string;
    meetingDateTime?: string;
  };

  const sb = createSupabaseClient();
  const { data: lead, error } = await sb.from("leads").select("*").eq("lead_id", params.id).single();
  if (error || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const today = new Date().toISOString().split("T")[0];
  const updates: Record<string, unknown> = {};

  if (callNotes?.trim()) {
    const entry = `[${today} call] ${callNotes.trim()}`;
    updates.notes = lead.notes?.trim() ? `${lead.notes}\n${entry}` : entry;
  }

  let meetingLink = "";
  let meetingBooked = false;
  let meetingError: string | null = null;
  if (meetingDateTime) {
    try {
      const contactName = lead.contact_name && lead.contact_name !== "there" ? lead.contact_name : "";
      const booking = await createBooking({
        summary: `Meet with ${contactName || lead.company}`,
        attendeeEmail: lead.email,
        attendeeName: contactName || undefined,
        startISO: meetingDateTime,
      });
      meetingLink = booking.hangoutLink;
      meetingBooked = true;
    } catch (e) {
      meetingError = e instanceof Error ? e.message : "Calendar booking failed";
    }
  }

  let sent = false;
  let sendError: string | null = null;

  // Auto-generate email from call notes if no manual email was provided
  let resolvedSubject = subject?.trim() || "";
  let resolvedBody = bodyHtml?.trim() || "";
  if (!resolvedSubject && callNotes?.trim() && lead.email) {
    const generated = await generateCallFollowupEmail(lead as Lead, callNotes);
    if (generated) {
      resolvedSubject = generated.subject;
      resolvedBody = generated.bodyHtml;
    }
  }

  if (resolvedSubject && resolvedBody) {
    try {
      const finalBody = fillMeetingLink(resolvedBody, meetingLink);
      const sendFn = lead.source === "cold_call" ? sendGmailFollowup : sendPersonalizedEmail;
      await sendFn(lead as Lead, resolvedSubject, finalBody);
      sent = true;
      updates.last_followup = today;
      updates.followup_count = (lead.followup_count || 0) + 1;
    } catch (e) {
      sendError = e instanceof Error ? e.message : "Send failed";
    }
  }

  const isColdCall = lead.source === "cold_call";

  if (meetingBooked) {
    updates.status = isColdCall ? "meeting_booked" : "booked";
    if (!lead.date_contacted) updates.date_contacted = today;
  } else if (isColdCall && lead.status === "called" && sent) {
    updates.status = "emailed";
    updates.date_contacted = today;
  } else if (!isColdCall && lead.status === "not_contacted" && sent) {
    updates.status = "contacted";
    updates.date_contacted = today;
  }

  if (status && status !== lead.status) {
    updates.status = status;
  }

  if (Object.keys(updates).length) {
    await sb.from("leads").update(updates).eq("lead_id", params.id);
  }

  return NextResponse.json({ sent, sendError, meetingBooked, meetingLink, meetingError });
}
