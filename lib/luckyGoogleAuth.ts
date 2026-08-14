import { google } from "googleapis";
import { createSupabaseClient } from "@/lib/supabase";
import { encryptSecret, decryptSecret } from "@/lib/leadQual/crypto";

// Reuses the exact same OAuth client (and therefore the same registered
// redirect URI) the client-calendar-connect flow already uses — see
// lib/leadQual/googleCalendar.ts. The callback route branches on `state`
// ("lucky" here vs a client_id there) rather than needing a second
// registered redirect URI in Google Cloud Console.
//
// No explicit return type here (matches lib/leadQual/googleCalendar.ts) —
// googleapis bundles its own private copy of google-auth-library, so
// annotating this as the top-level OAuth2Client type creates a structural
// mismatch (private `redirectUri` field) against what google.docs()/
// sheets()/drive() expect. Letting TS infer the type avoids that entirely.
function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

// Full (not restricted) scopes — this app is only ever used by Lucky
// himself against his own account, not a third party's data, so there's no
// reason to fight the drive.file restricted-scope's "only files this app
// created or the user picked" limitation.
const SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function buildLuckyGoogleAuthUrl(): string {
  const oauth2Client = getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: "lucky",
  });
}

export async function exchangeCodeAndStoreForLucky(code: string): Promise<void> {
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
  const { error } = await sb.from("lucky_google_connection").upsert(
    {
      id: "lucky",
      google_account_email: profile.email || null,
      encrypted_refresh_token: encryptSecret(tokens.refresh_token),
      connected_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) throw error;
}

export async function getLuckyGoogleAuthedClient() {
  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("lucky_google_connection")
    .select("encrypted_refresh_token")
    .eq("id", "lucky")
    .maybeSingle();
  if (error || !data) {
    throw new Error("Google isn't connected yet — connect it from /settings first.");
  }

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: decryptSecret(data.encrypted_refresh_token as unknown as Buffer) });
  return oauth2Client;
}

export async function getLuckyGoogleConnectionStatus(): Promise<{ connected: boolean; email: string | null }> {
  const sb = createSupabaseClient();
  const { data } = await sb.from("lucky_google_connection").select("google_account_email").eq("id", "lucky").maybeSingle();
  return { connected: !!data, email: data?.google_account_email || null };
}
