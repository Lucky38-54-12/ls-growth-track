import { createSupabaseClient, fetchAllRows } from "./supabase";
import { generateLeadId } from "./leads";
import { generateMeetingConfirmationEmail } from "./ai";
import { sendPersonalizedEmail } from "./email";
import { listUpcomingBookings, describeMeetingTime, fillMeetingLink, CalendarBooking } from "./calendar";
import { Lead } from "./types";

export interface CalendarSyncResult {
  checked: number;
  sent: number;
  skipped: number;
  errors: string[];
}

function companyFromSummary(summary: string): string {
  const m = summary.match(/^(?:meet|meeting|call|catch[\s-]?up|chat|coffee)\s+with\s+(.+)$/i);
  return (m ? m[1] : summary).trim();
}

async function findOrCreateLead(sb: ReturnType<typeof createSupabaseClient>, booking: CalendarBooking): Promise<Lead> {
  const { data: existing } = await sb.from("leads").select("*").eq("email", booking.attendeeEmail).maybeSingle();
  if (existing) return existing as Lead;

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
      const meetingTime = describeMeetingTime(booking.startISO);

      const { subject, bodyHtml } = await generateMeetingConfirmationEmail({
        company: lead.company,
        contactName: lead.contact_name,
        meetingTime,
      });

      const finalBody = fillMeetingLink(bodyHtml, booking.hangoutLink);
      await sendPersonalizedEmail(lead, subject, finalBody);

      const today = new Date().toISOString().split("T")[0];
      await sb.from("leads").update({ status: "booked", date_contacted: lead.date_contacted || today }).eq("lead_id", lead.lead_id);

      await sb.from("calendar_bookings").insert({ event_id: booking.eventId });
      sent++;
    } catch (err) {
      errors.push(`${booking.summary || booking.attendeeEmail}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { checked: bookings.length, sent, skipped, errors };
}
