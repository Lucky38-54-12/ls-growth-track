import { createSupabaseClient, fetchAllRows } from "./supabase";
import { generateLeadId } from "./leads";
import { generateMeetingConfirmationEmail, generateValueTouchpointEmail, generateMeetingDayReminderEmail } from "./ai";
// Meeting logistics (confirmation, pre-call value email, day-of reminder)
// go through Lucky's personal Gmail, not outreach@lsgrowth.agency — these
// are one-to-one conversations with someone who already booked a real call,
// not cold outreach, and mixing them into the same Resend/outreach mailbox
// as the campaign sequence would make that inbox messy for no reason.
import { sendGmailFollowup } from "./email";
import { listUpcomingBookings, describeMeetingTime, daysUntilMeeting, fillMeetingLink, CalendarBooking } from "./calendar";
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
  value_email_sent_at: string | null;
  reminder_email_sent_at: string | null;
}

export interface TouchpointResult {
  checked: number;
  valueSent: number;
  reminderSent: number;
  errors: string[];
}

// Sends the two extra touchpoint emails around a booked meeting: a "value"
// email about a week out, and a reminder the morning of the meeting (this
// runs on the same daily cron as syncCalendarBookings, which fires ~9-10am
// NZT). Each is sent at most once per booking, tracked via the
// *_email_sent_at columns on calendar_bookings.
export async function sendMeetingTouchpoints(): Promise<TouchpointResult> {
  const sb = createSupabaseClient();
  const rows = await fetchAllRows<TrackedBooking>((from, to) => sb.from("calendar_bookings").select("*").range(from, to));

  let valueSent = 0;
  let reminderSent = 0;
  const errors: string[] = [];

  for (const row of rows) {
    if (!row.lead_id || !row.start_iso) continue;
    const daysUntil = daysUntilMeeting(row.start_iso);
    if (daysUntil < 0) continue;

    try {
      const { data: lead } = await sb.from("leads").select("*").eq("lead_id", row.lead_id).maybeSingle();
      if (!lead) continue;

      const meetingTime = describeMeetingTime(row.start_iso);

      // Window (not an exact day match) so a missed cron run doesn't skip
      // the email entirely; the sent_at flag keeps it to a single send.
      if (!row.value_email_sent_at && daysUntil >= 4 && daysUntil <= 7) {
        const { subject, bodyHtml } = await generateValueTouchpointEmail({
          company: lead.company,
          contactName: lead.contact_name,
          meetingTime,
        });
        await sendGmailFollowup(lead as Lead, subject, bodyHtml, "meeting_value_touchpoint");
        await sb.from("calendar_bookings").update({ value_email_sent_at: new Date().toISOString() }).eq("event_id", row.event_id);
        valueSent++;
      }

      if (!row.reminder_email_sent_at && daysUntil === 0) {
        const { subject, bodyHtml } = await generateMeetingDayReminderEmail({
          company: lead.company,
          contactName: lead.contact_name,
          meetingTime,
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

  return { checked: rows.length, valueSent, reminderSent, errors };
}
