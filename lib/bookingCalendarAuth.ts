import { google } from "googleapis";
import { createSupabaseClient } from "@/lib/supabase";
import { encryptSecret, decryptSecret } from "@/lib/leadQual/crypto";

// OAuth connection to the real lsgrowthagency.co@gmail.com account, used by
// lib/calendar.ts for cold-call meeting bookings. Deliberately separate from
// lib/luckyGoogleAuth.ts (Lucky's own personal account, used for Docs/Sheets)
// — these are two different Google identities sharing the same OAuth
// client/redirect URI, distinguished by the `state` param on the shared
// callback route (see app/api/lead-qual/oauth/google/callback/route.ts).
function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

const SCOPES = ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/userinfo.email"];

export function buildBookingGoogleAuthUrl(): string {
  const oauth2Client = getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: "booking-calendar",
  });
}

export async function exchangeCodeAndStoreForBooking(code: string): Promise<void> {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh_token — you may have connected before without revoking access. Remove LS Growth's access at https://myaccount.google.com/permissions and try again."
    );
  }

  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data: profile } = await oauth2.userinfo.get();

  const sb = createSupabaseClient();
  const { error } = await sb.from("booking_google_connection").upsert(
    {
      id: "booking-calendar",
      google_account_email: profile.email || null,
      encrypted_refresh_token: encryptSecret(tokens.refresh_token),
      connected_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) throw error;
}

export async function getBookingGoogleAuthedClient() {
  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("booking_google_connection")
    .select("encrypted_refresh_token")
    .eq("id", "booking-calendar")
    .maybeSingle();
  if (error || !data) {
    throw new Error("Booking calendar isn't connected yet — connect it from /settings first.");
  }

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: decryptSecret(data.encrypted_refresh_token as unknown as Buffer) });
  return oauth2Client;
}

export async function getBookingGoogleConnectionStatus(): Promise<{ connected: boolean; email: string | null }> {
  const sb = createSupabaseClient();
  const { data } = await sb.from("booking_google_connection").select("google_account_email").eq("id", "booking-calendar").maybeSingle();
  return { connected: !!data, email: data?.google_account_email || null };
}
