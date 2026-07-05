import { createSupabaseClient } from "@/lib/supabase";

function getRedirectUri(): string {
  return process.env.META_OAUTH_REDIRECT_URI || "https://app.lsgrowth.agency/api/lead-qual/oauth/facebook/callback";
}

// `state` carries the lq_clients.id through the OAuth round trip, same
// pattern as the Google Calendar connect flow.
export function buildFacebookAuthUrl(clientId: string): string {
  const appId = process.env.META_APP_ID;
  if (!appId) throw new Error("META_APP_ID env var is not set");

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: getRedirectUri(),
    state: clientId,
    scope: "pages_show_list,pages_messaging,pages_manage_metadata",
  });
  return `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`;
}

export interface FacebookPageOption {
  id: string;
  name: string;
  access_token: string;
}

// Exchanges the OAuth code for a user access token, then lists the Pages
// that user manages (each with its own long-lived Page Access Token) —
// stashed in lq_pending_facebook_connections so the dashboard can show a
// picker before committing to one.
export async function exchangeCodeAndListPages(clientId: string, code: string): Promise<string> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_APP_ID / META_APP_SECRET env vars are not set");

  const tokenRes = await fetch(
    `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(getRedirectUri())}&client_secret=${appSecret}&code=${code}`
  );
  if (!tokenRes.ok) throw new Error(`Facebook token exchange failed: ${await tokenRes.text()}`);
  const { access_token: userAccessToken } = await tokenRes.json();

  const pagesRes = await fetch(
    `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userAccessToken)}`
  );
  if (!pagesRes.ok) throw new Error(`Facebook pages list failed: ${await pagesRes.text()}`);
  const { data: pages } = (await pagesRes.json()) as { data: FacebookPageOption[] };
  if (!pages || pages.length === 0) {
    throw new Error("No Facebook Pages found — make sure you're an admin of at least one Page and approved all requested permissions.");
  }

  const sb = createSupabaseClient();
  const { data: pending, error } = await sb
    .from("lq_pending_facebook_connections")
    .insert({ client_id: clientId, pages })
    .select()
    .single();
  if (error) throw error;

  return pending.id;
}
