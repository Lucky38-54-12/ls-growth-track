import { NextRequest, NextResponse } from "next/server";
import { createBooking, fillMeetingLink, formatMeetingClockTime } from "@/lib/calendar";
import { buildMeetingIcs } from "@/lib/ics";
import { sendGmailFollowup } from "@/lib/email";
import { generateCallFollowupEmail } from "@/lib/generateCallEmail";
import { generateDayBeforeReminderEmail, generateMeetingDayReminderEmail } from "@/lib/ai";
import { getBookingGoogleAuthedClient } from "@/lib/bookingCalendarAuth";
import { google } from "googleapis";
import { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

// Temporary route: creates a REAL calendar event (same createBooking call the
// real cold-call flow uses) so the Yes/No/Maybe RSVP actually round-trips to
// a real Google Calendar event. action=create books it + sends the
// confirmation email; action=sequence sends the full real lead journey
// (confirmation w/ video+invite, day-before reminder, day-of reminder);
// action=delete removes the real event afterward. Delete this whole route
// once done.
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

    // Email 1/3 — post-call confirmation, generated the same way the real
    // followup route does: AI copy told a video's coming so it writes a
    // natural lead-in, then the video thumbnail + real calendar invite
    // (with the real iCalUID) both get appended after.
    const callNotes =
      "Had a great chat with Lucky at Build It Well, a bathroom renovation company in Nelson. They're keen to get more booked bathroom reno jobs and agreed to a discovery call tomorrow to go through how it'd work.";
    const generated = await generateCallFollowupEmail(fakeLead as Lead, callNotes, { includesVideo: true });
    const confirmIcs = buildMeetingIcs({
      eventId: booking.eventId,
      icalUid: booking.icalUid,
      startISO: booking.startISO,
      endISO: booking.endISO,
      summary: "Meet with Build It Well (TEST SEQUENCE - delete me)",
      location: booking.hangoutLink || undefined,
      organizerEmail: process.env.GMAIL_USER!,
      attendeeEmail: to,
      attendeeName: "Lucky",
    });
    if (generated) {
      const base = process.env.APP_URL || "https://app.lsgrowth.agency";
      const videoUrl = `${base}/videos/lucky-intro.mp4`;
      const thumbUrl = `${base}/videos/lucky-intro-thumb.jpg`;
      let finalBody = fillMeetingLink(generated.bodyHtml, booking.hangoutLink);
      finalBody += `<p><a href="${videoUrl}"><img src="${thumbUrl}" alt="A quick message from Lucky — tap to watch" width="320" style="max-width:320px;width:100%;height:auto;border:0;display:block;border-radius:8px;" /></a></p>`;
      await sendGmailFollowup(
        fakeLead as Lead,
        `[TEST 1/3 - Booking confirmation w/ video + calendar invite] ${generated.subject}`,
        finalBody,
        "test_sequence_1_confirmation",
        confirmIcs
      );
      results.email1 = "sent";
    } else {
      results.email1 = "generateCallFollowupEmail returned null (ANTHROPIC_API_KEY missing?)";
    }

    // Email 2/3 — day-before reminder, same generator + real invite the
    // production calendar sync uses.
    const dayBefore = await generateDayBeforeReminderEmail({
      company: "Build It Well",
      contactName: "Lucky",
      meetingTime: clockTime,
    });
    const dayBeforeIcs = buildMeetingIcs({
      eventId: booking.eventId,
      icalUid: booking.icalUid,
      startISO: booking.startISO,
      endISO: booking.endISO,
      summary: "Meet with Build It Well (TEST SEQUENCE - delete me)",
      location: booking.hangoutLink || undefined,
      organizerEmail: process.env.GMAIL_USER!,
      attendeeEmail: to,
      attendeeName: "Lucky",
    });
    await sendGmailFollowup(
      fakeLead as Lead,
      `[TEST 2/3 - Day-before reminder] ${dayBefore.subject}`,
      fillMeetingLink(dayBefore.bodyHtml, booking.hangoutLink),
      "test_sequence_2_day_before",
      dayBeforeIcs
    );
    results.email2 = "sent";

    // Email 3/3 — day-of reminder.
    const dayOf = await generateMeetingDayReminderEmail({
      company: "Build It Well",
      contactName: "Lucky",
      meetingTime: clockTime,
    });
    const dayOfIcs = buildMeetingIcs({
      eventId: booking.eventId,
      icalUid: booking.icalUid,
      startISO: booking.startISO,
      endISO: booking.endISO,
      summary: "Meet with Build It Well (TEST SEQUENCE - delete me)",
      location: booking.hangoutLink || undefined,
      organizerEmail: process.env.GMAIL_USER!,
      attendeeEmail: to,
      attendeeName: "Lucky",
    });
    await sendGmailFollowup(
      fakeLead as Lead,
      `[TEST 3/3 - Day-of reminder] ${dayOf.subject}`,
      fillMeetingLink(dayOf.bodyHtml, booking.hangoutLink),
      "test_sequence_3_day_of",
      dayOfIcs
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
