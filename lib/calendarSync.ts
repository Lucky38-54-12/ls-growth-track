import { createSupabaseClient, fetchAllRows } from "./supabase";
import { generateLeadId } from "./leads";
import { generateDayBeforeReminderEmail, generateMeetingDayReminderEmail } from "./ai";
// Meeting reminders (day-before, 3-hours-before) go through
// bookings@lsgrowth.agency via Resend — a dedicated identity separate from
// both the cold-outreach and cold-call-follow-up addresses (see BOOKINGS_FROM
// comment in lib/email.ts), since this is transactional logistics mail to
// someone who already booked a real call, not cold outreach.
import { sendBookingsFollowup, sendPlainBookings, BOOKING_URL } from "./email";
import { sendReminderSms } from "./sms";
import { listUpcomingBookings, formatMeetingClockTime, fillMeetingLink, CalendarBooking } from "./calendar";
import { notifySlack } from "./slackNotify";
import { Lead } from "./types";

export interface CalendarSyncResult {
  checked: number;
  sent: number;
  skipped: number;
  errors: string[];
}

const MEETING_TITLE_PATTERN = /^(?:meet|meeting|call|catch[\s-]?up|chat|coffee)\s+with\s+(.+)$/i;

function companyFromSummary(summary: string): string {
  const m = summary.match(MEETING_TITLE_PATTERN);
  return (m ? m[1] : summary).trim();
}

// listUpcomingBookings pulls every event on the primary Google Calendar with
// a non-self attendee — no filtering for business relevance at all, so a
// personal appointment (a massage booking, dinner with a friend) reads as a
// "booking" exactly like a real cold-call prospect and gets turned into a
// fake lead cluttering the Cold Call pipeline. Confirmed live: "Book a
// massage. between Lucky and Savithry Thangaraju" and "Lucky Singh and
// Lucky" both became real "booked" leads in the pipeline. Only auto-create a
// brand new lead when the event title actually looks like a business
// meeting ("meet/call/chat/coffee with X") — anything else just gets
// skipped rather than silently turned into a fake lead.
async function findOrCreateLead(sb: ReturnType<typeof createSupabaseClient>, booking: CalendarBooking): Promise<Lead | null> {
  const { data: existing } = await sb.from("leads").select("*").eq("email", booking.attendeeEmail).maybeSingle();
  if (existing) return existing as Lead;

  if (!MEETING_TITLE_PATTERN.test(booking.summary)) return null;

  const company = companyFromSummary(booking.summary) || booking.attendeeEmail;
  const contactName = booking.attendeeName || company;

  const existingIdsRows = await fetchAllRows<{ lead_id: string }>((from, to) => sb.from("leads").select("lead_id").range(from, to));
  const existingIds = new Set<string>(existingIdsRows.map((r) => r.lead_id));
  const leadId = generateLeadId(company, existingIds);
  const today = new Date().toISOString().split("T")[0];

  const { data: inserted, error } = await sb
    .from("leads")
    .insert({
      lead_id: leadId,
      company,
      contact_name: contactName,
      email: booking.attendeeEmail,
      trade: "",
      location: "",
      status: "not_contacted",
      date_added: today,
      date_contacted: null,
      last_followup: null,
      followup_count: 0,
      notes: "",
      source: "cold_call",
    })
    .select()
    .single();

  if (error || !inserted) throw new Error(error?.message || "Could not create lead");
  return inserted as Lead;
}

// Checks the calendar for new bookings, sends a confirmation email for each
// one not seen before, and marks them as processed so they aren't resent.
export async function syncCalendarBookings(): Promise<CalendarSyncResult> {
  const sb = createSupabaseClient();
  const bookings = await listUpcomingBookings();

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const booking of bookings) {
    const { data: already } = await sb
      .from("calendar_bookings")
      .select("event_id, attendee_email, hangout_link, ical_uid")
      .eq("event_id", booking.eventId)
      .maybeSingle();
    if (already) {
      // Backfills attendee_email/attendee_name/summary onto rows created
      // before those columns existed, so sendMeetingTouchpoints can still
      // reach them without needing every booking re-created from scratch.
      if (!already.attendee_email) {
        await sb.from("calendar_bookings").update({
          attendee_email: booking.attendeeEmail, attendee_name: booking.attendeeName, summary: booking.summary,
        }).eq("event_id", booking.eventId);
      }
      // Backfills hangout_link onto rows synced before the location-field
      // fallback existed (see listUpcomingBookings) — those rows have an
      // empty hangout_link and every reminder for them silently drops the
      // meeting link.
      if (!already.hangout_link && booking.hangoutLink) {
        await sb.from("calendar_bookings").update({ hangout_link: booking.hangoutLink }).eq("event_id", booking.eventId);
      }
      // Backfills ical_uid onto rows synced before it was tracked — without
      // it, buildMeetingIcs falls back to a made-up UID that doesn't match
      // the real event, so a lead's Yes/No/Maybe reply to our own reminder
      // email never actually wrote the RSVP back to the real calendar event.
      if (!already.ical_uid && booking.icalUid) {
        await sb.from("calendar_bookings").update({ ical_uid: booking.icalUid }).eq("event_id", booking.eventId);
      }
      skipped++;
      continue;
    }

    // Google Calendar sometimes hands back two different event IDs for what
    // is really the same meeting (observed live: a reschedule left both the
    // old and new event on the feed, same attendee, same start time). The
    // event_id check above misses that, so each one became its own
    // calendar_bookings row and sendMeetingTouchpoints reminded the same
    // person twice for the same meeting. Treat same attendee + same start
    // time as the same booking regardless of event_id.
    const { data: duplicateBooking } = await sb
      .from("calendar_bookings")
      .select("event_id")
      .eq("start_iso", booking.startISO)
      .eq("attendee_email", booking.attendeeEmail)
      .maybeSingle();
    if (duplicateBooking) {
      skipped++;
      continue;
    }

    try {
      const lead = await findOrCreateLead(sb, booking);
      if (!lead) {
        // Not a recognizable business meeting and not an existing lead —
        // don't create a fake pipeline lead or send the lead-pipeline
        // confirmation email. Attendee/summary are still recorded so
        // sendMeetingTouchpoints below can still remind whoever's on the
        // invite (and Slack-ping Lucky) even without a lead record.
        await sb.from("calendar_bookings").insert({
          event_id: booking.eventId, lead_id: null, start_iso: booking.startISO, end_iso: booking.endISO, hangout_link: booking.hangoutLink,
          attendee_email: booking.attendeeEmail, attendee_name: booking.attendeeName, summary: booking.summary, ical_uid: booking.icalUid,
        });
        skipped++;
        continue;
      }
      const today = new Date().toISOString().split("T")[0];
      await sb.from("leads").update({ status: "booked", date_contacted: lead.date_contacted || today }).eq("lead_id", lead.lead_id);

      await sb.from("calendar_bookings").insert({
        event_id: booking.eventId,
        lead_id: lead.lead_id,
        start_iso: booking.startISO,
        end_iso: booking.endISO,
        hangout_link: booking.hangoutLink,
        attendee_email: booking.attendeeEmail,
        attendee_name: booking.attendeeName,
        summary: booking.summary,
        ical_uid: booking.icalUid,
      });
      sent++;
    } catch (err) {
      errors.push(`${booking.summary || booking.attendeeEmail}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { checked: bookings.length, sent, skipped, errors };
}

interface TrackedBooking {
  event_id: string;
  lead_id: string | null;
  start_iso: string | null;
  end_iso: string | null;
  hangout_link: string | null;
  attendee_email: string | null;
  attendee_name: string | null;
  summary: string | null;
  ical_uid: string | null;
  day_before_email_sent_at: string | null;
  reminder_email_sent_at: string | null;
}

export interface TouchpointResult {
  checked: number;
  dayBeforeSent: number;
  reminderSent: number;
  errors: string[];
}

// 7pm the evening before, and 3 hours before the meeting itself — same
// cadence as the AI lead-qual callback reminders (lib/leadQual/callbackReminder.ts).
const DAY_BEFORE_HOUR = 19; // 7pm local, the evening before the meeting
// Cron catch-up (see comment below) used to have no upper bound, so a run
// landing hours late (observed: GitHub Actions gaps of 3-5+ hours) sent the
// "day before" email as late as 11pm — unprofessional to land in a client's
// inbox at that hour. Past this cutoff, skip the day-before touch entirely
// for that booking rather than send it in the middle of the night; the
// same-day reminder still covers it.
const DAY_BEFORE_CUTOFF_HOUR = 21; // 9pm local — stop trying after this
const SAME_DAY_LEAD_MINUTES = 180; // 3 hours before the meeting
const SAME_DAY_WINDOW_MINUTES = 15; // pads the 180min mark so a run isn't required to land exactly on it; isSameDayDue below also catches up late if a run lands after it
// If Lucky already sent this lead something (a manual call-logged
// confirmation, most often) within this window, skip the reminder touch
// rather than pepper them with a second email hours later for the same
// meeting — the *_email_sent_at column still gets marked so it doesn't
// retry every 15 minutes for the rest of the window.
const RECENT_SEND_SKIP_HOURS = 12;

async function hasRecentSend(sb: ReturnType<typeof createSupabaseClient>, leadId: string, hours: number): Promise<boolean> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data } = await sb.from("email_sends").select("id").eq("lead_id", leadId).gt("sent_at", since).limit(1);
  return Boolean(data && data.length);
}

// Sends the two reminder emails around a booked meeting: a simple heads-up
// at 7pm the evening before, and a simple heads-up 3 hours before the
// meeting itself. Runs on an hourly cron (see /api/cron/calendar-sync and
// cron.yml). Each is sent at most once per booking, tracked via the
// *_email_sent_at columns on calendar_bookings.
export async function sendMeetingTouchpoints(): Promise<TouchpointResult> {
  const sb = createSupabaseClient();
  const rows = await fetchAllRows<TrackedBooking>((from, to) => sb.from("calendar_bookings").select("*").range(from, to));
  const timeZone = "Pacific/Auckland";
  const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const hourFmt = new Intl.DateTimeFormat("en-NZ", { timeZone, hour: "2-digit", hour12: false });

  let dayBeforeSent = 0;
  let reminderSent = 0;
  const errors: string[] = [];

  for (const row of rows) {
    if (!row.start_iso) continue;
    if (row.day_before_email_sent_at && row.reminder_email_sent_at) continue;

    try {
      const now = new Date();
      const start = new Date(row.start_iso);
      if (start.getTime() < now.getTime()) continue;

      const nowDateStr = dateFmt.format(now);
      const nowHour = parseInt(hourFmt.format(now), 10);
      const dayBeforeDateStr = dateFmt.format(new Date(start.getTime() - 24 * 60 * 60 * 1000));
      const minutesUntil = (start.getTime() - now.getTime()) / 60_000;

      // ">=" rather than "===" on both checks below: the GitHub Actions cron
      // this runs on is documented to land late (observed gaps of 3-5+
      // hours despite an offset schedule meant to dodge scheduler pileup —
      // see cron.yml), so a run can easily land after its target window
      // instead of inside it. Catching up as soon as a run notices a
      // reminder is overdue beats requiring one to land in a narrow slot
      // and risking a silent miss. The nowDateStr===dayBeforeDateStr guard
      // still stops it firing on the wrong calendar day; the upper bound on
      // isSameDayDue still stops it firing hours early.
      const isDayBeforeDue =
        !row.day_before_email_sent_at &&
        nowDateStr === dayBeforeDateStr &&
        nowHour >= DAY_BEFORE_HOUR &&
        nowHour < DAY_BEFORE_CUTOFF_HOUR;
      const isSameDayDue =
        !row.reminder_email_sent_at &&
        minutesUntil <= SAME_DAY_LEAD_MINUTES + SAME_DAY_WINDOW_MINUTES;

      if (!isDayBeforeDue && !isSameDayDue) continue;

      // Lead is optional now — bookings that never matched the "meet/call
      // with X" pattern (see findOrCreateLead) still have an attendee_email
      // from the calendar invite and still get reminded, they just don't
      // go through the lead-tracking CTA rewriting sendBookingsFollowup
      // does. Lucky gets a Slack ping either way so nothing on his calendar
      // is silently unreminded, lead or not.
      const lead = row.lead_id ? await sb.from("leads").select("*").eq("lead_id", row.lead_id).maybeSingle().then((r) => r.data as Lead | null) : null;
      const contactName = lead?.contact_name || row.attendee_name || "";
      const label = lead?.company || row.summary || row.attendee_email || "your meeting";
      const clockTime = formatMeetingClockTime(row.start_iso, timeZone);
      // No .ics attached to these reminders — Google's own native calendar
      // invite (sent when the event was created, see createBooking) already
      // carries the real RSVP. A self-built .ics from this address would be
      // a second, separate invite and (if it's the lead's first .ics from
      // us) trips Gmail's "haven't interacted with this sender... Report
      // spam" banner, which reads as untrustworthy — plain reminder text is
      // safer here even though it's easier to skim past.

      const skipRecentSend = lead ? await hasRecentSend(sb, lead.lead_id, RECENT_SEND_SKIP_HOURS) : false;

      if (isDayBeforeDue) {
        if (!skipRecentSend && (lead || row.attendee_email)) {
          const { subject, bodyHtml } = await generateDayBeforeReminderEmail({
            company: lead?.company || label,
            contactName,
            meetingTime: clockTime,
          });
          const finalBody = fillMeetingLink(bodyHtml, row.hangout_link || "");
          if (lead) {
            await sendBookingsFollowup(lead, subject, finalBody, "meeting_day_before_reminder");
          } else if (row.attendee_email) {
            await sendPlainBookings(row.attendee_email, subject, finalBody.replace(/\{\{CTA_LINK\}\}/g, BOOKING_URL));
          }
          // No SMS here — texts only go out when Lucky sends the initial
          // confirmation email (see the followup route) and again 3 hours
          // before the meeting below, not on this day-before touch.
        }
        await notifySlack(
          skipRecentSend
            ? `📅 Skipped day-before reminder for *${label}* (tomorrow at ${clockTime}) — already emailed them within the last ${RECENT_SEND_SKIP_HOURS}h.`
            : `📅 Reminder sent: *${label}* is tomorrow at ${clockTime}.`
        );
        await sb.from("calendar_bookings").update({ day_before_email_sent_at: new Date().toISOString() }).eq("event_id", row.event_id);
        dayBeforeSent++;
      } else {
        if (!skipRecentSend && (lead || row.attendee_email)) {
          const { subject, bodyHtml } = await generateMeetingDayReminderEmail({
            company: lead?.company || label,
            contactName,
            meetingTime: clockTime,
          });
          const finalBody = fillMeetingLink(bodyHtml, row.hangout_link || "");
          if (lead) {
            await sendBookingsFollowup(lead, subject, finalBody, "meeting_day_reminder");
          } else if (row.attendee_email) {
            await sendPlainBookings(row.attendee_email, subject, finalBody);
          }
          await sendReminderSms(
            lead?.phone,
            `Hey${contactName ? ` ${contactName}` : ""}, our meeting is in about 3 hours (${clockTime}).${row.hangout_link ? ` ${row.hangout_link}` : ""} — Lucky, LS Growth`
          );
        }
        await notifySlack(
          skipRecentSend
            ? `📅 Skipped same-day reminder for *${label}* (in ~3 hours) — already emailed them within the last ${RECENT_SEND_SKIP_HOURS}h.`
            : `📅 Heads up: *${label}* is in ~3 hours (${clockTime})${row.hangout_link ? ` — ${row.hangout_link}` : ""}.`
        );
        await sb.from("calendar_bookings").update({ reminder_email_sent_at: new Date().toISOString() }).eq("event_id", row.event_id);
        reminderSent++;
      }
    } catch (err) {
      errors.push(`${row.event_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { checked: rows.length, dayBeforeSent, reminderSent, errors };
}
