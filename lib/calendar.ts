import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

function getAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env var is not set");
  const credentials = JSON.parse(key);
  return new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
}

export interface CalendarBooking {
  eventId: string;
  summary: string;
  startISO: string;
  attendeeEmail: string;
  attendeeName: string;
  hangoutLink: string;
}

// Lists upcoming events with an external attendee (i.e. booked appointments),
// going back 1 day to catch bookings made just before their slot.
export async function listUpcomingBookings(): Promise<CalendarBooking[]> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const auth = getAuth();
  const calendar = google.calendar({ version: "v3", auth });

  const timeMin = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const res = await calendar.events.list({
    calendarId,
    timeMin,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });

  const bookings: CalendarBooking[] = [];
  for (const ev of res.data.items || []) {
    if (!ev.id || !ev.start?.dateTime) continue;
    const attendee = (ev.attendees || []).find((a) => !a.self && a.email);
    if (!attendee?.email) continue;

    bookings.push({
      eventId: ev.id,
      summary: ev.summary || "",
      startISO: ev.start.dateTime,
      attendeeEmail: attendee.email.toLowerCase(),
      attendeeName: attendee.displayName || "",
      hangoutLink: ev.hangoutLink || "",
    });
  }

  return bookings;
}

export interface CreateBookingInput {
  summary: string;
  attendeeEmail: string;
  attendeeName?: string;
  startISO: string;
  durationMinutes?: number;
  timeZone?: string;
}

export interface CreatedBooking {
  eventId: string;
  hangoutLink: string;
}

// Returns the UTC offset (in minutes) of timeZone at the given instant,
// e.g. +780 for Pacific/Auckland during daylight saving (UTC+13).
function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(date);
  const offset = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+00:00";
  const m = offset.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
}

// Parses a datetime string into an absolute instant. If it already carries
// timezone info (e.g. ends in "Z" or "+13:00") that's used as-is. Otherwise
// (e.g. the naive "YYYY-MM-DDTHH:mm" from an <input type="datetime-local">)
// it's interpreted as local time in `timeZone`.
function parseDateTime(value: string, timeZone: string): Date {
  if (/(Z|[+-]\d{2}:\d{2})$/.test(value)) return new Date(value);
  const naive = value.length === 16 ? `${value}:00` : value;
  const asUtc = new Date(`${naive}Z`);
  const offsetMinutes = timeZoneOffsetMinutes(asUtc, timeZone);
  return new Date(asUtc.getTime() - offsetMinutes * 60000);
}

// Creates a calendar event with a Google Meet link and invites the attendee,
// e.g. when a meeting time is agreed during a cold call.
export async function createBooking(input: CreateBookingInput): Promise<CreatedBooking> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const auth = getAuth();
  const calendar = google.calendar({ version: "v3", auth });

  const timeZone = input.timeZone || "Pacific/Auckland";
  const start = parseDateTime(input.startISO, timeZone);
  const end = new Date(start.getTime() + (input.durationMinutes ?? 30) * 60000);

  // Note: attendees aren't added and no conferenceData is requested here —
  // service accounts can't send calendar invites or auto-create Meet links
  // without Domain-Wide Delegation (Workspace-only, not available on a plain
  // Gmail account). Instead we use one fixed Meet room from GOOGLE_MEET_LINK
  // and the lead gets that link via the follow-up email itself.
  const meetLink = process.env.GOOGLE_MEET_LINK || "";
  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: input.summary,
      description: `${input.attendeeName || ""} <${input.attendeeEmail}>`.trim(),
      location: meetLink,
      start: { dateTime: start.toISOString(), timeZone },
      end: { dateTime: end.toISOString(), timeZone },
    },
  });

  const ev = res.data;
  if (!ev.id) throw new Error("Calendar API did not return an event id");
  return { eventId: ev.id, hangoutLink: meetLink };
}

export interface CalendarEvent {
  eventId: string;
  summary: string;
  startISO: string;
  endISO: string;
  allDay: boolean;
  attendeeEmail: string;
  attendeeName: string;
  hangoutLink: string;
  location: string;
  description: string;
  leadCompany: string;
  leadContactName: string;
}

// Lists all events (not just lead bookings) in the given UTC range, e.g. for
// rendering a calendar view.
export async function listCalendarEvents(timeMinISO: string, timeMaxISO: string): Promise<CalendarEvent[]> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const auth = getAuth();
  const calendar = google.calendar({ version: "v3", auth });

  const res = await calendar.events.list({
    calendarId,
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  const events: CalendarEvent[] = [];
  for (const ev of res.data.items || []) {
    const start = ev.start?.dateTime || ev.start?.date;
    const end = ev.end?.dateTime || ev.end?.date;
    if (!ev.id || !start || !end) continue;
    const attendee = (ev.attendees || []).find((a) => !a.self && a.email);

    const location = ev.location || "";
    const isTimed = !!ev.start?.dateTime;
    const hangoutLink = ev.hangoutLink || (location.startsWith("http") ? location : "") || (isTimed ? process.env.GOOGLE_MEET_LINK || "" : "");
    events.push({
      eventId: ev.id,
      summary: ev.summary || "(No title)",
      startISO: start,
      endISO: end,
      allDay: !ev.start?.dateTime,
      attendeeEmail: attendee?.email?.toLowerCase() || "",
      attendeeName: attendee?.displayName || "",
      hangoutLink,
      location: hangoutLink === location ? "" : location,
      description: ev.description || "",
      leadCompany: "",
      leadContactName: "",
    });
  }

  return events;
}

// Returns the UTC start/end instants for a given calendar day (YYYY-MM-DD)
// in the given time zone, e.g. for fetching "today"'s events.
export function getDayRangeUTC(dateStr: string, timeZone = "Pacific/Auckland"): { startISO: string; endISO: string } {
  const start = parseDateTime(`${dateStr}T00:00`, timeZone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

// Lists today's events (in NZ time) — used for the "meetings today" prompt
// on the dashboard.
export async function listTodaysEvents(timeZone = "Pacific/Auckland"): Promise<CalendarEvent[]> {
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const { startISO, endISO } = getDayRangeUTC(todayStr, timeZone);
  return listCalendarEvents(startISO, endISO);
}

// Fills in a Meet link wherever an email body references it, supporting both
// the AI-generated "[MEETING LINK]" placeholder (own paragraph, becomes a link
// or is removed if there's no link) and the manually-typed "{{MEETING_LINK}}"
// placeholder (used as a bare href, like {{CTA_LINK}}).
export function fillMeetingLink(bodyHtml: string, hangoutLink: string): string {
  if (hangoutLink) {
    return bodyHtml
      .replace(/\[MEETING LINK\]/g, `<a href="${hangoutLink}">${hangoutLink}</a>`)
      .replace(/\{\{MEETING_LINK\}\}/g, hangoutLink);
  }
  return bodyHtml
    .replace(/<p>\s*\[MEETING LINK\]\s*<\/p>/gi, "")
    .replace(/\[MEETING LINK\]/g, "")
    .replace(/\{\{MEETING_LINK\}\}/g, "");
}

// Describes a meeting time relative to today, e.g. "today at 3:30pm",
// "tomorrow at 10am", "Wednesday at 3:30pm".
export function describeMeetingTime(startISO: string, timeZone = "Pacific/Auckland"): string {
  const start = new Date(startISO);
  const now = new Date();

  const dateKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const startDay = new Date(dateKeyFmt.format(start));
  const today = new Date(dateKeyFmt.format(now));
  const dayDiff = Math.round((startDay.getTime() - today.getTime()) / 86400000);

  let dayLabel: string;
  if (dayDiff === 0) dayLabel = "today";
  else if (dayDiff === 1) dayLabel = "tomorrow";
  else dayLabel = new Intl.DateTimeFormat("en-NZ", { timeZone, weekday: "long" }).format(start);

  const timeStr = new Intl.DateTimeFormat("en-NZ", { timeZone, hour: "numeric", minute: "2-digit", hour12: true })
    .format(start)
    .replace(" ", "")
    .toLowerCase();

  return `${dayLabel} at ${timeStr}`;
}
