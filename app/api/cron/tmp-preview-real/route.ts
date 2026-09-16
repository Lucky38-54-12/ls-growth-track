import { NextRequest, NextResponse } from "next/server";
import { createBooking, fillMeetingLink, formatMeetingClockTime } from "@/lib/calendar";
import { sendGmailFollowup } from "@/lib/email";
import { generateVideoIntroEmail } from "@/lib/generateCallEmail";
import { generateDayBeforeReminderEmail, generateMeetingDayReminderEmail } from "@/lib/ai";
import { getBookingGoogleAuthedClient } from "@/lib/bookingCalendarAuth";
import { createSupabaseClient } from "@/lib/supabase";
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

  if (action === "send-dayof-video-real") {
    // One-off real send: Andrew/King Projects, meeting today at 12pm.
    // Day-of reminder copy (not the "tomorrow" video-intro template, since
    // his meeting is today) with the video added as the last touchpoint
    // before the call. No new calendar event created — uses his existing
    // booking's real meet link.
    const leadId = req.nextUrl.searchParams.get("leadId");
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const sb = createSupabaseClient();
    const { data: lead, error } = await sb.from("leads").select("*").eq("lead_id", leadId).single();
    if (error || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const { data: bookingRow } = await sb
      .from("calendar_bookings")
      .select("start_iso, hangout_link")
      .eq("lead_id", leadId)
      .order("start_iso", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!bookingRow) return NextResponse.json({ error: "No calendar_bookings row for this lead" }, { status: 404 });

    const meetingTime = formatMeetingClockTime(bookingRow.start_iso);
    const contactName = lead.contact_name && lead.contact_name !== "there" ? lead.contact_name : "";
    const base = process.env.APP_URL || "https://app.lsgrowth.agency";
    const videoUrl = `${base}/videos/lucky-intro.mp4`;
    const thumbUrl = `${base}/videos/lucky-intro-thumb.jpg`;
    const bodyHtml = [
      `<p>Hey${contactName ? ` ${contactName}` : ""},</p>`,
      `<p>Just a reminder we have our meeting today at ${meetingTime}. Looking forward to chatting!</p>`,
      `<p>You can join here: <a href="${bookingRow.hangout_link}">${bookingRow.hangout_link}</a></p>`,
      `<p>If something's come up and you can't make it, text or call me on 021 028 20190 and I'll find another time, no problem either way.</p>`,
      `<p>Before we jump on, here's a quick video from me.</p>`,
      `<p><a href="${videoUrl}"><img src="${thumbUrl}" alt="A quick message from Lucky — tap to watch" width="320" style="max-width:320px;width:100%;height:auto;border:0;display:block;border-radius:8px;" /></a></p>`,
    ].join("\n");
    await sendGmailFollowup(lead as Lead, "Have a look at this before we jump on", bodyHtml, "meeting_day_reminder_video");

    return NextResponse.json({ ok: true, sentTo: lead.email, meetingTime, hangoutLink: bookingRow.hangout_link });
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
