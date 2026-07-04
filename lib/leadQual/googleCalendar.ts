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
    scope: ["https://www.googleapis.com/auth/calendar"],
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
