import { NextRequest, NextResponse } from "next/server";
import { createBooking } from "@/lib/calendar";
import { buildMeetingIcs } from "@/lib/ics";
import { sendGmailFollowup } from "@/lib/email";
import { getBookingGoogleAuthedClient } from "@/lib/bookingCalendarAuth";
import { google } from "googleapis";
import { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

// Temporary route: creates a REAL calendar event (same createBooking call the
// real cold-call flow uses) so the Yes/No/Maybe RSVP actually round-trips to
// a real Google Calendar event, unlike the earlier fake-.ics-only preview.
// action=create books it + sends the confirmation email; action=delete
// removes the real event afterward so nothing lingers on the business
// calendar. Delete this whole route once done.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.TMP_PREVIEW_SECRET || secret !== process.env.TMP_PREVIEW_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = req.nextUrl.searchParams.get("action") || "create";
  const to = req.nextUrl.searchParams.get("to") || "luckyspersonal38@gmail.com";

  if (action === "delete") {
    const eventId = req.nextUrl.searchParams.get("eventId");
    if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });
    const auth = await getBookingGoogleAuthedClient();
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.events.delete({
      calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
      eventId,
      sendUpdates: "all",
    });
    return NextResponse.json({ ok: true, deleted: eventId });
  }

  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);

  const booking = await createBooking({
    summary: "Meet with Test Co (REAL PREVIEW - delete me)",
    attendeeEmail: to,
    attendeeName: "Lucky",
    startISO: start.toISOString(),
  });

  const icsInvite = buildMeetingIcs({
    eventId: booking.eventId,
    icalUid: booking.icalUid,
    startISO: booking.startISO,
    endISO: booking.endISO,
    summary: "Meet with Test Co (REAL PREVIEW - delete me)",
    location: booking.hangoutLink || undefined,
    organizerEmail: process.env.GMAIL_USER!,
    attendeeEmail: to,
    attendeeName: "Lucky",
  });

  const fakeLead: Partial<Lead> = {
    lead_id: "test-preview-lead",
    company: "Test Co",
    contact_name: "Lucky",
    email: to,
    trade: "Builders",
  };

  const subject = "[PREVIEW-REAL] Great chatting today, Lucky";
  const bodyHtml = [
    `<p>Hey Lucky,</p>`,
    `<p>This is the real version — a genuine Google Calendar event backs this invite, so clicking Yes/No actually RSVPs.</p>`,
    `<p>You can join here: <a href="${booking.hangoutLink}">${booking.hangoutLink}</a></p>`,
  ].join("\n");

  await sendGmailFollowup(fakeLead as Lead, subject, bodyHtml, "preview_test_real", icsInvite);

  return NextResponse.json({ ok: true, sentTo: to, eventId: booking.eventId });
}
