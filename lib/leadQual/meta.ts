import crypto from "crypto";
import { createSupabaseClient } from "@/lib/supabase";
import { decryptSecret, encryptSecret } from "./crypto";

// Meta signs every webhook POST body with the app secret so we can confirm
// it really came from Meta and wasn't spoofed by a third party hitting our
// public URL directly.
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) throw new Error("META_APP_SECRET env var is not set");

  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
}

export interface ResolvedChannel {
  channelId: string;
  clientId: string;
  pageAccessToken: string;
}

export async function resolveChannelByPageId(pageId: string): Promise<ResolvedChannel | null> {
  const sb = createSupabaseClient();
  const { data } = await sb
    .from("lq_channels")
    .select("id, client_id, credentials")
    .eq("type", "messenger")
    .eq("external_page_id", pageId)
    .maybeSingle();

  if (!data || !data.credentials) return null;
  return {
    channelId: data.id,
    clientId: data.client_id,
    pageAccessToken: decryptSecret(data.credentials as unknown as Buffer),
  };
}

// Subscribes this app to the Page's webhook fields via the Graph API —
// this is the step that previously had to be clicked manually in the Meta
// developer console ("Add Subscriptions") for every new client.
async function subscribeWebhookForPage(pageId: string, pageAccessToken: string): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/v20.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins&access_token=${encodeURIComponent(pageAccessToken)}`,
    { method: "POST" }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Webhook subscription failed: ${res.status} ${body}`);
  }
}

export async function connectMessengerPage(clientId: string, pageId: string, pageAccessToken: string): Promise<void> {
  await subscribeWebhookForPage(pageId, pageAccessToken);

  const sb = createSupabaseClient();
  const { error } = await sb.from("lq_channels").upsert(
    {
      client_id: clientId,
      type: "messenger",
      external_page_id: pageId,
      credentials: encryptSecret(pageAccessToken),
    },
    { onConflict: "type,external_page_id" }
  );
  if (error) throw error;
}

export async function sendMessengerReply(pageAccessToken: string, recipientPsid: string, text: string): Promise<void> {
  const res = await fetch(`https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientPsid }, message: { text } }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Messenger send failed: ${res.status} ${body}`);
  }
}

export interface DeadChannel {
  clientName: string;
  pageId: string;
  reason: string;
}

// A dead page token fails silently from the outside — Messenger just stops
// replying, with nothing in the logs pointing at "reconnect this page" (this
// exact failure mode cost real Shine Cleans / Queenstown Cleaning traffic
// before it was caught manually). Checking token validity daily via Meta's
// own debug_token endpoint turns that into a same-day Slack alert instead.
export async function checkMessengerChannelHealth(): Promise<DeadChannel[]> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_APP_ID / META_APP_SECRET env vars are not set");

  const sb = createSupabaseClient();
  const { data: channels } = await sb
    .from("lq_channels")
    .select("external_page_id, credentials, lq_clients(name)")
    .eq("type", "messenger");

  const dead: DeadChannel[] = [];
  for (const channel of channels || []) {
    const clientName = (channel.lq_clients as unknown as { name: string } | null)?.name || "unknown client";
    let token: string;
    try {
      token = decryptSecret(channel.credentials as unknown as Buffer);
    } catch (e) {
      dead.push({ clientName, pageId: channel.external_page_id, reason: `could not decrypt stored token: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${appId}|${appSecret}`
      );
      const body = await res.json();
      if (!res.ok || !body?.data?.is_valid) {
        dead.push({ clientName, pageId: channel.external_page_id, reason: body?.data?.error?.message || body?.error?.message || "token reported invalid" });
      }
    } catch (e) {
      dead.push({ clientName, pageId: channel.external_page_id, reason: `debug_token request failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  return dead;
}
