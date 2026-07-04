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

export async function connectMessengerPage(clientId: string, pageId: string, pageAccessToken: string): Promise<void> {
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
