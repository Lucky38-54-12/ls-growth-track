import { google } from "googleapis";
import { createSupabaseClient } from "@/lib/supabase";
import { encryptSecret, decryptSecret } from "./crypto";

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

// `state` carries the lq_clients.id through the OAuth round trip so the
// callback knows which client this connection belongs to.
export function buildGoogleAuthUrl(clientId: string): string {
  const oauth2Client = getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: "offline", // required to get a refresh_token back
    prompt: "consent", // forces Google to re-issue a refresh_token even on a repeat connect
    // userinfo.email is needed for the oauth2.userinfo.get() call below,
    // which fetches the connected account's email to store/display —
    // calendar-only scope leaves that call with no authorization and it
    // fails with "missing required authentication credential".
    //
    // calendar.events + calendar.freebusy (not the full "calendar" scope)
    // is deliberate — this app only ever calls events.insert and
    // freebusy.query (see resolveAvailableSlot / booking below), and the
    // full scope is Google's "restricted" tier (needs a paid third-party
    // security assessment to verify). These two are "sensitive" tier
    // instead — standard verification only, no assessment.
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.freebusy",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state: clientId,
  });
}

export async function exchangeCodeAndStore(clientId: string, code: string): Promise<void> {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh_token — the client may have already connected before without revoking access. Ask them to remove LS Growth's access at https://myaccount.google.com/permissions and try connecting again."
    );
  }

  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data: profile } = await oauth2.userinfo.get();

  const sb = createSupabaseClient();
  const { error } = await sb.from("lq_calendar_connections").upsert(
    {
      client_id: clientId,
      google_account_email: profile.email || null,
      encrypted_refresh_token: encryptSecret(tokens.refresh_token),
      connected_at: new Date().toISOString(),
    },
    { onConflict: "client_id" }
  );
  if (error) throw error;
}

async function getAuthedClientFor(clientId: string) {
  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("lq_calendar_connections")
    .select("encrypted_refresh_token, calendar_id")
    .eq("client_id", clientId)
    .single();
  if (error || !data) throw new Error("This client hasn't connected a Google Calendar yet");

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: decryptSecret(data.encrypted_refresh_token as unknown as Buffer),
  });
  return { oauth2Client, calendarId: data.calendar_id as string };
}

export interface BookJobInput {
  clientId: string;
  summary: string;
  description: string;
  location?: string;
  startISO: string;
  durationMinutes?: number;
  timeZone: string;
}

// Books a job (site visit / quote) straight onto the client's own connected
// Google Calendar — no invite/attendee needed, this is the client's own
// calendar, not a shared meeting.
export async function bookJobOnClientCalendar(input: BookJobInput): Promise<{ eventId: string }> {
  const { oauth2Client, calendarId } = await getAuthedClientFor(input.clientId);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const start = new Date(input.startISO);
  const end = new Date(start.getTime() + (input.durationMinutes ?? 60) * 60000);

  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: { dateTime: start.toISOString(), timeZone: input.timeZone },
      end: { dateTime: end.toISOString(), timeZone: input.timeZone },
    },
  });

  if (!res.data.id) throw new Error("Google Calendar API did not return an event id");
  return { eventId: res.data.id };
}

// Interprets a naive "YYYY-MM-DDTHH:MM:SS" string (no zone info — this is
// what the AI extracts, meaning wall-clock time in the client's own zone) as
// an actual instant. Classic offset-diffing trick: render the same instant
// in both the target zone and UTC, and the difference between those two
// renderings IS the zone's offset at that moment (correct across DST
// boundaries), without pulling in a date library for one calculation.
function localToUtc(localDateTime: string, timeZone: string): Date {
  const naive = new Date(localDateTime.replace(/Z$/, "") + "Z");
  const asTz = new Date(naive.toLocaleString("en-US", { timeZone }));
  const asUtc = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
  const offset = asUtc.getTime() - asTz.getTime();
  return new Date(naive.getTime() + offset);
}

const BUSINESS_HOURS_START = 8;
const BUSINESS_HOURS_END = 17;
const SLOT_INCREMENT_MINUTES = 30;
const MAX_SEARCH_DAYS = 10;

function isWithinBusinessHours(instant: Date, timeZone: string): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false, weekday: "short" }).formatToParts(instant);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  return weekday !== "Sat" && weekday !== "Sun" && hour >= BUSINESS_HOURS_START && hour < BUSINESS_HOURS_END;
}

export interface ResolveSlotInput {
  clientId: string;
  desiredLocalDateTime: string | undefined; // "YYYY-MM-DDTHH:MM:SS" in timeZone, from the AI's extraction — may be missing/unparseable
  durationMinutes: number;
  timeZone: string;
}

// Turns "whatever the lead loosely asked for" into a real, conflict-free
// slot on the client's actual calendar: checks free/busy starting from the
// requested time (or a sensible next-business-day fallback if nothing usable
// was extracted) and walks forward in 30-minute steps, skipping anything
// outside business hours or already booked, up to a 10-business-day search
// window. Replaces the old "always exactly 24h from now, never checked"
// placeholder.
export async function resolveAvailableSlot(input: ResolveSlotInput): Promise<Date> {
  const { oauth2Client, calendarId } = await getAuthedClientFor(input.clientId);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  let desired: Date;
  if (input.desiredLocalDateTime) {
    const parsed = localToUtc(input.desiredLocalDateTime, input.timeZone);
    desired = Number.isNaN(parsed.getTime()) ? nextBusinessMorning(input.timeZone) : parsed;
  } else {
    desired = nextBusinessMorning(input.timeZone);
  }

  const now = new Date();
  if (desired.getTime() < now.getTime() + 60 * 60000) {
    desired = new Date(now.getTime() + 60 * 60000);
  }

  const searchUntil = new Date(desired.getTime() + MAX_SEARCH_DAYS * 24 * 60 * 60000);
  const fb = await calendar.freebusy.query({
    requestBody: { timeMin: desired.toISOString(), timeMax: searchUntil.toISOString(), items: [{ id: calendarId }] },
  });
  const busy = (fb.data.calendars?.[calendarId]?.busy || []).map((b) => ({
    start: new Date(b.start!).getTime(),
    end: new Date(b.end!).getTime(),
  }));

  const durationMs = input.durationMinutes * 60000;
  let candidate = desired;
  while (candidate.getTime() < searchUntil.getTime()) {
    const slotEnd = new Date(candidate.getTime() + durationMs);
    const conflicts = busy.some((b) => candidate.getTime() < b.end && slotEnd.getTime() > b.start);
    if (isWithinBusinessHours(candidate, input.timeZone) && !conflicts) {
      return candidate;
    }
    candidate = new Date(candidate.getTime() + SLOT_INCREMENT_MINUTES * 60000);
  }
  // Search window exhausted (client's calendar is unusually packed) — book
  // the originally requested time anyway rather than fail the booking
  // entirely; a human can move it later.
  return desired;
}

// Fallback when the AI didn't extract a usable time at all — 10am tomorrow
// in the client's own local date, pushed forward if that lands on a weekend.
function nextBusinessMorning(timeZone: string): Date {
  const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  let d = new Date(localToUtc(`${todayLocal}T10:00:00`, timeZone).getTime() + 24 * 60 * 60000);
  for (let i = 0; i < 7 && !isWithinBusinessHours(d, timeZone); i++) {
    d = new Date(d.getTime() + 24 * 60 * 60000);
  }
  return d;
}
