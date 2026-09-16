import { NextRequest, NextResponse } from "next/server";
import { createBooking, fillMeetingLink, formatMeetingClockTime } from "@/lib/calendar";
import { sendGmailFollowup } from "@/lib/email";
import { generateVideoIntroEmail } from "@/lib/generateCallEmail";
import { generateDayBeforeReminderEmail, generateMeetingDayReminderEmail } from "@/lib/ai";
import { getBookingGoogleAuthedClient } from "@/lib/bookingCalendarAuth";
import { google } from "googleapis";
import { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

// Temporary route: creates a REAL calendar event (same createBooking call the
// real cold-call flow uses), using the actual production email functions so
// this is a true preview, not a copy. action=create books it + sends a
// single generic confirmation; action=sequence sends the real 3-email
// Builder-lead journey (video intro, day-before reminder, day-of reminder —
// the calendar RSVP itself comes from Google's own native invite, not
// anything built here); action=delete removes the real event afterward.
// Delete this whole route once done.
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

  if (action === "sequence") {
    const fakeLead: Partial<Lead> = {
      lead_id: "test-preview-lead",
      company: "Build It Well",
      contact_name: "Lucky",
      email: to,
      trade: "Bathroom renovations",
      location: "Nelson",
    };

    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    start.setHours(13, 0, 0, 0);

    const booking = await createBooking({
      summary: "Meet with Build It Well (TEST SEQUENCE - delete me)",
      attendeeEmail: to,
      attendeeName: "Lucky",
      startISO: start.toISOString(),
    });

    const clockTime = formatMeetingClockTime(booking.startISO);
    const results: Record<string, unknown> = { eventId: booking.eventId };
    const callNotes =
      "Had a great chat with Lucky at Build It Well, a bathroom renovation company in Nelson. They're keen to get more booked bathroom reno jobs and agreed to a discovery call tomorrow.";

    // Email 1/3 — video intro (real production template + generator).
    const videoEmail = await generateVideoIntroEmail(fakeLead as Lead, callNotes, clockTime, booking.hangoutLink);
    await sendGmailFollowup(
      fakeLead as Lead,
      `[TEST 1/3 - Video intro] ${videoEmail.subject}`,
      videoEmail.bodyHtml,
      "test_sequence_1_video"
    );
    results.email1 = "sent";

    // Email 2/3 — day-before reminder (real production generator, no .ics —
    // Google's own native invite from createBooking above is the real RSVP).
    const dayBefore = await generateDayBeforeReminderEmail({
      company: "Build It Well",
      contactName: "Lucky",
      meetingTime: clockTime,
    });
    await sendGmailFollowup(
      fakeLead as Lead,
      `[TEST 2/3 - Day-before reminder] ${dayBefore.subject}`,
      fillMeetingLink(dayBefore.bodyHtml, booking.hangoutLink),
      "test_sequence_2_day_before"
    );
    results.email2 = "sent";

    // Email 3/3 — day-of reminder.
    const dayOf = await generateMeetingDayReminderEmail({
      company: "Build It Well",
      contactName: "Lucky",
      meetingTime: clockTime,
    });
    await sendGmailFollowup(
      fakeLead as Lead,
      `[TEST 3/3 - Day-of reminder] ${dayOf.subject}`,
      fillMeetingLink(dayOf.bodyHtml, booking.hangoutLink),
      "test_sequence_3_day_of"
    );
    results.email3 = "sent";

    return NextResponse.json({ ok: true, sentTo: to, ...results });
  }

  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);

  const booking = await createBooking({
    summary: "Meet with Test Co (REAL PREVIEW - delete me)",
    attendeeEmail: to,
    attendeeName: "Lucky",
    startISO: start.toISOString(),
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
    `<p>This is the real version — a genuine Google Calendar event backs this, so clicking Yes/No on Google's own invite actually RSVPs.</p>`,
    `<p>You can join here: <a href="${booking.hangoutLink}">${booking.hangoutLink}</a></p>`,
  ].join("\n");

  await sendGmailFollowup(fakeLead as Lead, subject, bodyHtml, "preview_test_real");

  return NextResponse.json({ ok: true, sentTo: to, eventId: booking.eventId });
}
