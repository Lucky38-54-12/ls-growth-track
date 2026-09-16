// Builds a real calendar invite (.ics, METHOD:REQUEST) to attach to meeting
// reminder emails via nodemailer's icalEvent option. Gmail/Outlook recognize
// a text/calendar;method=REQUEST part and render it as an actual invitation
// (Yes/No/Maybe buttons, "Add to calendar") rather than a plain email — much
// harder to miss than a plain-text reminder. Same UID/sequence across the
// day-before and same-day sends for one meeting so mail clients treat them
// as updates to a single invite instead of two separate events.
function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function toIcsUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export interface MeetingIcsInput {
  eventId: string;
  // The real Google Calendar event's iCalUID. Without this, a lead's
  // Yes/No/Maybe reply looks like it works (Gmail renders the buttons fine)
  // but never actually writes an RSVP back to the real event, since Gmail's
  // reply routing matches by UID — falls back to a made-up one only for
  // callers that genuinely have no real backing event (e.g. a preview).
  icalUid?: string;
  startISO: string;
  endISO: string;
  summary: string;
  location?: string;
  organizerEmail: string;
  organizerName?: string;
  attendeeEmail: string;
  attendeeName?: string;
}

export function buildMeetingIcs(input: MeetingIcsInput): string {
  const uid = input.icalUid || `${input.eventId}@lsgrowth.agency`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LS Growth//Meeting Reminder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "SEQUENCE:0",
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${toIcsUtc(input.startISO)}`,
    `DTEND:${toIcsUtc(input.endISO)}`,
    `SUMMARY:${icsEscape(input.summary)}`,
    ...(input.location ? [`LOCATION:${icsEscape(input.location)}`] : []),
    `ORGANIZER;CN=${icsEscape(input.organizerName || "Lucky")}:mailto:${input.organizerEmail}`,
    `ATTENDEE;CN=${icsEscape(input.attendeeName || input.attendeeEmail)};RSVP=TRUE:mailto:${input.attendeeEmail}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}
