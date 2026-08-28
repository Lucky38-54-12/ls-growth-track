import { createSupabaseClient } from "./supabase";
import { FirefliesTranscript } from "./fireflies";
import { pickRecapRecipients } from "./salesCallRecap";
import { Lead } from "./types";

const TIME_MATCH_WINDOW_MS = 30 * 60 * 1000;

// A Fireflies call carries no lead_id of its own — this correlates it back
// to the existing leads/calendar_bookings records (the same ones the cold-
// call pipeline and calendar sync already maintain) so a client's real
// email/phone/company come from data Lucky already has on file, instead of
// only whatever Fireflies happened to capture as meeting attendees (often
// nothing, for calls not booked through a Calendar invite).
export async function findLeadForCall(
  sb: ReturnType<typeof createSupabaseClient>,
  transcript: FirefliesTranscript
): Promise<Lead | null> {
  // 1. Exact match: the call's Google Meet link is the same one calendar
  // sync recorded when the meeting was booked.
  if (transcript.meetingLink) {
    const { data: booking } = await sb
      .from("calendar_bookings")
      .select("lead_id")
      .eq("hangout_link", transcript.meetingLink)
      .not("lead_id", "is", null)
      .maybeSingle();
    if (booking?.lead_id) {
      const lead = await fetchLead(sb, booking.lead_id);
      if (lead) return lead;
    }
  }

  // 2. Fallback: an external attendee/organizer email that's already a
  // known lead.
  for (const email of pickRecapRecipients(transcript)) {
    const { data: lead } = await sb.from("leads").select("*").eq("email", email).maybeSingle();
    if (lead) return lead as Lead;
  }

  // 3. Fallback: a calendar booking whose scheduled time is close enough to
  // when this call actually happened, for calls where Fireflies' meeting
  // link differs from what's stored (e.g. a recurring room link).
  if (transcript.dateMs) {
    const from = new Date(transcript.dateMs - TIME_MATCH_WINDOW_MS).toISOString();
    const to = new Date(transcript.dateMs + TIME_MATCH_WINDOW_MS).toISOString();
    const { data: bookings } = await sb
      .from("calendar_bookings")
      .select("lead_id, start_iso")
      .not("lead_id", "is", null)
      .gte("start_iso", from)
      .lte("start_iso", to);
    if (bookings && bookings.length > 0) {
      const closest = bookings.reduce((best, row) =>
        Math.abs(new Date(row.start_iso!).getTime() - transcript.dateMs!) <
        Math.abs(new Date(best.start_iso!).getTime() - transcript.dateMs!)
          ? row
          : best
      );
      const lead = await fetchLead(sb, closest.lead_id!);
      if (lead) return lead;
    }
  }

  return null;
}

async function fetchLead(sb: ReturnType<typeof createSupabaseClient>, leadId: string): Promise<Lead | null> {
  const { data } = await sb.from("leads").select("*").eq("lead_id", leadId).maybeSingle();
  return (data as Lead) || null;
}
