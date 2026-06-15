import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

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
