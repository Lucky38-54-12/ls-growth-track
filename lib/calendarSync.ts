import { createSupabaseClient, fetchAllRows } from "./supabase";
import { generateLeadId } from "./leads";
import { generateMeetingConfirmationEmail, generateDayBeforeReminderEmail, generateMeetingDayReminderEmail } from "./ai";
// Meeting logistics (confirmation, day-before reminder, 2-hours-before
// reminder) go through Lucky's personal Gmail, not outreach@lsgrowth.agency —
// these are one-to-one conversations with someone who already booked a real
// call, not cold outreach, and mixing them into the same Resend/outreach
// mailbox as the campaign sequence would make that inbox messy for no reason.
import { sendGmailFollowup } from "./email";
import { listUpcomingBookings, describeMeetingTime, formatMeetingClockTime, fillMeetingLink, CalendarBooking } from "./calendar";
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
      .select("event_id")
      .eq("event_id", booking.eventId)
      .maybeSingle();
    if (already) {
      skipped++;
      continue;
    }

    try {
      const lead = await findOrCreateLead(sb, booking);
      if (!lead) {
        // Not a recognizable business meeting and not an existing lead —
        // record it as seen so it's not re-evaluated every day, but don't
        // create a fake lead or send anything for it.
        await sb.from("calendar_bookings").insert({
          event_id: booking.eventId, lead_id: null, start_iso: booking.startISO, hangout_link: booking.hangoutLink,
        });
        skipped++;
        continue;
      }
      const meetingTime = describeMeetingTime(booking.startISO);

      const { subject, bodyHtml } = await generateMeetingConfirmationEmail({
        company: lead.company,
        contactName: lead.contact_name,
        meetingTime,
      });

      const finalBody = fillMeetingLink(bodyHtml, booking.hangoutLink);
      await sendGmailFollowup(lead, subject, finalBody, "meeting_confirmation");

      const today = new Date().toISOString().split("T")[0];
      await sb.from("leads").update({ status: "booked", date_contacted: lead.date_contacted || today }).eq("lead_id", lead.lead_id);

      await sb.from("calendar_bookings").insert({
        event_id: booking.eventId,
        lead_id: lead.lead_id,
        start_iso: booking.startISO,
        hangout_link: booking.hangoutLink,
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
  hangout_link: string | null;
  day_before_email_sent_at: string | null;
  reminder_email_sent_at: string | null;
}

export interface TouchpointResult {
  checked: number;
  dayBeforeSent: number;
  reminderSent: number;
  errors: string[];
}

// 7pm the evening before, and 2 hours before the meeting itself — same
// cadence as the AI lead-qual callback reminders (lib/leadQual/callbackReminder.ts).
const DAY_BEFORE_HOUR = 19; // 7pm local, the evening before the meeting
const SAME_DAY_LEAD_MINUTES = 120;
const SAME_DAY_WINDOW_MINUTES = 15; // ±15min so the 15-min cron always lands inside it

// Sends the two reminder emails around a booked meeting: a simple heads-up
// at 7pm the evening before, and a simple heads-up 2 hours before the
// meeting itself. Runs on a 15-min cron (see /api/cron/calendar-sync). Each
// is sent at most once per booking, tracked via the *_email_sent_at columns
// on calendar_bookings.
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
    if (!row.lead_id || !row.start_iso) continue;
    if (row.day_before_email_sent_at && row.reminder_email_sent_at) continue;

    try {
      const now = new Date();
      const start = new Date(row.start_iso);
      if (start.getTime() < now.getTime()) continue;

      const nowDateStr = dateFmt.format(now);
      const nowHour = parseInt(hourFmt.format(now), 10);
      const dayBeforeDateStr = dateFmt.format(new Date(start.getTime() - 24 * 60 * 60 * 1000));
      const minutesUntil = (start.getTime() - now.getTime()) / 60_000;

      const isDayBeforeDue = !row.day_before_email_sent_at && nowDateStr === dayBeforeDateStr && nowHour === DAY_BEFORE_HOUR;
      const isSameDayDue =
        !row.reminder_email_sent_at &&
        minutesUntil <= SAME_DAY_LEAD_MINUTES + SAME_DAY_WINDOW_MINUTES &&
        minutesUntil >= SAME_DAY_LEAD_MINUTES - SAME_DAY_WINDOW_MINUTES;

      if (!isDayBeforeDue && !isSameDayDue) continue;

      const { data: lead } = await sb.from("leads").select("*").eq("lead_id", row.lead_id).maybeSingle();
      if (!lead) continue;

      const clockTime = formatMeetingClockTime(row.start_iso, timeZone);

      if (isDayBeforeDue) {
        const { subject, bodyHtml } = await generateDayBeforeReminderEmail({
          company: lead.company,
          contactName: lead.contact_name,
          meetingTime: clockTime,
        });
        await sendGmailFollowup(lead as Lead, subject, bodyHtml, "meeting_day_before_reminder");
        await sb.from("calendar_bookings").update({ day_before_email_sent_at: new Date().toISOString() }).eq("event_id", row.event_id);
        dayBeforeSent++;
      } else {
        const { subject, bodyHtml } = await generateMeetingDayReminderEmail({
          company: lead.company,
          contactName: lead.contact_name,
          meetingTime: clockTime,
        });
        const finalBody = fillMeetingLink(bodyHtml, row.hangout_link || "");
        await sendGmailFollowup(lead as Lead, subject, finalBody, "meeting_day_reminder");
        await sb.from("calendar_bookings").update({ reminder_email_sent_at: new Date().toISOString() }).eq("event_id", row.event_id);
        reminderSent++;
      }
    } catch (err) {
      errors.push(`${row.event_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { checked: rows.length, dayBeforeSent, reminderSent, errors };
}
