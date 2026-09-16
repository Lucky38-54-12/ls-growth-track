import { createSupabaseClient, fetchAllRows } from "./supabase";
import { generateLeadId } from "./leads";
import { generateDayBeforeReminderEmail, generateMeetingDayReminderEmail } from "./ai";
// Meeting logistics (confirmation, day-before reminder, 2-hours-before
// reminder) go through Lucky's personal Gmail, not outreach@lsgrowth.agency —
// these are one-to-one conversations with someone who already booked a real
// call, not cold outreach, and mixing them into the same Resend/outreach
// mailbox as the campaign sequence would make that inbox messy for no reason.
import { sendGmailFollowup, sendPlainGmail, BOOKING_URL } from "./email";
import { listUpcomingBookings, formatMeetingClockTime, fillMeetingLink, CalendarBooking } from "./calendar";
import { notifySlack } from "./slackNotify";
import { buildMeetingIcs } from "./ics";
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
      .select("event_id, attendee_email, hangout_link")
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
          attendee_email: booking.attendeeEmail, attendee_name: booking.attendeeName, summary: booking.summary,
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
      // go through the lead-tracking pixel/CTA rewriting sendGmailFollowup
      // does. Lucky gets a Slack ping either way so nothing on his calendar
      // is silently unreminded, lead or not.
      const lead = row.lead_id ? await sb.from("leads").select("*").eq("lead_id", row.lead_id).maybeSingle().then((r) => r.data as Lead | null) : null;
      const contactName = lead?.contact_name || row.attendee_name || "";
      const label = lead?.company || row.summary || row.attendee_email || "your meeting";
      const clockTime = formatMeetingClockTime(row.start_iso, timeZone);
      const attendeeEmail = lead?.email || row.attendee_email || "";
      // A real calendar invite attached to the reminder itself — Gmail/Outlook
      // render a text/calendar;method=REQUEST part as an actual invitation
      // (Yes/No/Maybe, add-to-calendar), which is far harder to miss than a
      // plain-text reminder. Falls back to start+30min for bookings synced
      // before end_iso was tracked (see supabase_migration_calendar_bookings_end_iso.sql).
      const icsInvite =
        attendeeEmail && process.env.GMAIL_USER
          ? buildMeetingIcs({
              eventId: row.event_id,
              startISO: row.start_iso,
              endISO: row.end_iso || new Date(start.getTime() + 30 * 60000).toISOString(),
              summary: row.summary || label,
              location: row.hangout_link || undefined,
              organizerEmail: process.env.GMAIL_USER,
              attendeeEmail,
              attendeeName: contactName || undefined,
            })
          : undefined;

      if (isDayBeforeDue) {
        if (lead || row.attendee_email) {
          const { subject, bodyHtml } = await generateDayBeforeReminderEmail({
            company: lead?.company || label,
            contactName,
            meetingTime: clockTime,
          });
          const finalBody = fillMeetingLink(bodyHtml, row.hangout_link || "");
          if (lead) {
            await sendGmailFollowup(lead, subject, finalBody, "meeting_day_before_reminder", icsInvite);
          } else if (row.attendee_email) {
            await sendPlainGmail(row.attendee_email, subject, finalBody.replace(/\{\{CTA_LINK\}\}/g, BOOKING_URL), icsInvite);
          }
        }
        await notifySlack(`📅 Reminder sent: *${label}* is tomorrow at ${clockTime}.`);
        await sb.from("calendar_bookings").update({ day_before_email_sent_at: new Date().toISOString() }).eq("event_id", row.event_id);
        dayBeforeSent++;
      } else {
        if (lead || row.attendee_email) {
          const { subject, bodyHtml } = await generateMeetingDayReminderEmail({
            company: lead?.company || label,
            contactName,
            meetingTime: clockTime,
          });
          const finalBody = fillMeetingLink(bodyHtml, row.hangout_link || "");
          if (lead) {
            await sendGmailFollowup(lead, subject, finalBody, "meeting_day_reminder", icsInvite);
          } else if (row.attendee_email) {
            await sendPlainGmail(row.attendee_email, subject, finalBody, icsInvite);
          }
        }
        await notifySlack(`📅 Heads up: *${label}* is in ~3 hours (${clockTime})${row.hangout_link ? ` — ${row.hangout_link}` : ""}.`);
        await sb.from("calendar_bookings").update({ reminder_email_sent_at: new Date().toISOString() }).eq("event_id", row.event_id);
        reminderSent++;
      }
    } catch (err) {
      errors.push(`${row.event_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { checked: rows.length, dayBeforeSent, reminderSent, errors };
}
