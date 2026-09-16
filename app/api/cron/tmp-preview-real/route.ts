import { NextRequest, NextResponse } from "next/server";
import { createBooking, fillMeetingLink, formatMeetingClockTime } from "@/lib/calendar";
import { buildMeetingIcs } from "@/lib/ics";
import { sendGmailFollowup } from "@/lib/email";
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

    // Email 1/4 — Lucky's exact copy for the video-intro email: greeting,
    // meet link, a recap line, then the video + pre-call-research pitch.
    {
      const base = process.env.APP_URL || "https://app.lsgrowth.agency";
      const videoUrl = `${base}/videos/lucky-intro.mp4`;
      const thumbUrl = `${base}/videos/lucky-intro-thumb.jpg`;
      const recapLine =
        "we'll have a look at getting Build It Well more booked bathroom renovation jobs in Nelson";
      const videoBody = [
        `<p>Hi Lucky,</p>`,
        `<p>Looking forward to our chat tomorrow at ${clockTime}.</p>`,
        `<p>Here's the link to join:</p>`,
        `<p><a href="${booking.hangoutLink}">${booking.hangoutLink}</a></p>`,
        `<p>Just as a quick recap, ${recapLine}.</p>`,
        `<p>Before the call, I also wanted to give you a quick look at what we actually do.</p>`,
        `<p><a href="${videoUrl}"><img src="${thumbUrl}" alt="A quick message from Lucky — tap to watch" width="320" style="max-width:320px;width:100%;height:auto;border:0;display:block;border-radius:8px;" /></a></p>`,
        `<p>It's a short video showing some real campaigns and results we've generated for businesses similar to yours.</p>`,
        `<p>I'll also spend some time before the call looking through your current setup, competitors and where I think there could be opportunities to bring in more work.</p>`,
        `<p>I'll bring what I find to the call and walk you through it.</p>`,
        `<p>The whole thing should only take around 10–15 minutes. Even if we decide there's nothing worth doing together, you'll have a few things you can take away from the conversation.</p>`,
        `<p>If anything comes up and you need to shift the time, just flick me a text.</p>`,
        `<p>Looking forward to it.</p>`,
      ].join("\n");
      await sendGmailFollowup(
        fakeLead as Lead,
        `[TEST 1/4 - Video intro] Looking forward to our chat tomorrow`,
        videoBody,
        "test_sequence_1_video",
      );
      results.email1 = "sent";
    }

    // Email 2/4 — separate calendar-link email, the real invite with no
    // video attached.
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
    const calendarBody = [
      `<p>Hey Lucky,</p>`,
      `<p>Locking in our chat — here's the calendar invite for tomorrow at ${clockTime}.</p>`,
      `<p>You can join here: <a href="${booking.hangoutLink}">${booking.hangoutLink}</a></p>`,
    ].join("\n");
    await sendGmailFollowup(
      fakeLead as Lead,
      "[TEST 2/4 - Calendar invite]",
      calendarBody,
      "test_sequence_2_calendar",
      confirmIcs
    );
    results.email2 = "sent";

    // Email 3/4 — day-before reminder, same generator + real invite the
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
      `[TEST 3/4 - Day-before reminder] ${dayBefore.subject}`,
      fillMeetingLink(dayBefore.bodyHtml, booking.hangoutLink),
      "test_sequence_3_day_before",
      dayBeforeIcs
    );
    results.email3 = "sent";

    // Email 4/4 — day-of reminder.
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
      `[TEST 4/4 - Day-of reminder] ${dayOf.subject}`,
      fillMeetingLink(dayOf.bodyHtml, booking.hangoutLink),
      "test_sequence_4_day_of",
      dayOfIcs
    );
    results.email4 = "sent";

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
