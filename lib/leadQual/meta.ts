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
//
// subscribed_apps is a REPLACE, not a merge: whatever fields are in the POST
// become the *entire* subscribed set, dropping anything not listed. Two
// separate calls (messaging fields, then leadgen) used to run back-to-back
// here, and the second call was silently wiping out the first — every
// reconnect and every nightly resubscribe cron run left the page subscribed
// to leadgen only, with Messenger dead. Must always be a single call with
// every field the page should have.
const MESSAGING_FIELDS = "messages,messaging_postbacks,messaging_optins,message_echoes";

async function subscribeWebhookForPage(pageId: string, pageAccessToken: string): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/v20.0/${pageId}/subscribed_apps?subscribed_fields=${MESSAGING_FIELDS},leadgen&access_token=${encodeURIComponent(pageAccessToken)}`,
    { method: "POST" }
  );
  if (res.ok) return;

  // leadgen (Facebook Lead Ads forms) needs the leads_retrieval permission,
  // which Meta gates behind Advanced Access App Review — a Page connected
  // via personal OAuth won't have it unless that review has gone through.
  // The combined call above fails outright when that permission is missing,
  // so fall back to messaging-only, which the Messenger chat this exists for
  // doesn't depend on leadgen for.
  const fallback = await fetch(
    `https://graph.facebook.com/v20.0/${pageId}/subscribed_apps?subscribed_fields=${MESSAGING_FIELDS}&access_token=${encodeURIComponent(pageAccessToken)}`,
    { method: "POST" }
  );
  if (!fallback.ok) {
    const body = await fallback.text();
    throw new Error(`Webhook subscription failed: ${fallback.status} ${body}`);
  }
}

// Non-fatal — a client's Page connection shouldn't fail just because the
// logo fetch hiccuped, so this is best-effort and swallows its own errors.
async function fetchPageLogoUrl(pageId: string, pageAccessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${pageId}/picture?type=large&redirect=false&access_token=${encodeURIComponent(pageAccessToken)}`
    );
    if (!res.ok) return null;
    const body = await res.json();
    return body?.data?.url || null;
  } catch {
    return null;
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

  // Pulls the client's real logo straight from their Facebook Page instead
  // of anyone needing to upload one — refreshed every time the Page
  // (re)connects, so a client's rebrand carries through automatically.
  const logoUrl = await fetchPageLogoUrl(pageId, pageAccessToken);
  if (logoUrl) {
    await sb.from("lq_clients").update({ logo_url: logoUrl }).eq("id", clientId);
  }
}

// Every other "don't talk over a human" check (isHumanStaffEcho, paused_at)
// depends on Meta's echo webhook event actually arriving — which is exactly
// what silently failed for a Katie's Elite Cleaning lead (Ying Wood): staff
// replied manually in the Page inbox, the echo never reached us (mid-outage),
// paused_at never got set, and the AI carried on qualifying her days later as
// if no one had said a word — flatly contradicting the quote staff had
// already given her. This is the hard backstop: right before actually
// sending, ask Facebook's own thread — the one source of truth that doesn't
// depend on our webhook — whether the Page has said anything we don't
// recognize as our own. If so, treat it as a human takeover regardless of
// what paused_at says.
export async function humanRepliedOnFacebook(
  pageId: string,
  psid: string,
  pageAccessToken: string,
  knownAssistantTexts: string[]
): Promise<{ humanReplied: boolean; message?: string }> {
  const convRes = await fetch(
    `https://graph.facebook.com/v20.0/${pageId}/conversations?fields=participants&limit=10&access_token=${encodeURIComponent(pageAccessToken)}`
  );
  const convBody = await convRes.json();
  if (convBody.error) throw new Error(`humanRepliedOnFacebook conversations lookup failed: ${JSON.stringify(convBody.error)}`);

  const thread = (convBody.data || []).find((c: { participants?: { data?: { id: string }[] } }) =>
    (c.participants?.data || []).some((p) => p.id === psid)
  );
  if (!thread) return { humanReplied: false }; // no thread yet (brand new lead) — nothing to check against

  // Facebook returns newest-first. Must find the single most recent message
  // the PAGE itself sent, however many lead-only messages sit on top of it —
  // not just the messages at the very top of the list. A lead who goes quiet
  // for weeks after a human quoted them, then messages back once more,
  // pushes that human message below their own most recent one; stopping at
  // the first non-Page message (the old, buggy version of this check) walks
  // right past it and misses the human takeover entirely. This is exactly
  // what happened with Marcus Vize Senior (Katie's Elite Cleaning): staff
  // quoted him in person on Aug 1, he replied three weeks later, and this
  // check's earlier version only looked at his own most recent message
  // before giving up, never seeing the staff quote sitting just below it.
  const msgRes = await fetch(
    `https://graph.facebook.com/v20.0/${thread.id}/messages?fields=from,message&limit=25&access_token=${encodeURIComponent(pageAccessToken)}`
  );
  const msgBody = await msgRes.json();
  if (msgBody.error) throw new Error(`humanRepliedOnFacebook messages lookup failed: ${JSON.stringify(msgBody.error)}`);

  const normalized = knownAssistantTexts.map((t) => t.trim());
  const lastPageMessage = (msgBody.data || []).find(
    (msg: { from?: { id?: string }; message?: string }) => msg.from?.id === pageId
  );
  if (lastPageMessage?.message && !normalized.includes(lastPageMessage.message.trim())) {
    return { humanReplied: true, message: lastPageMessage.message };
  }
  return { humanReplied: false };
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

export interface LeadgenField {
  name: string;
  values: string[];
}

// A Lead Ads submission (Facebook/Instagram "Instant Form") arrives on the
// webhook as just an id — the actual name/email/phone the person typed in
// has to be pulled separately from the Graph API.
export async function fetchLeadgenDetails(leadgenId: string, pageAccessToken: string): Promise<LeadgenField[]> {
  const res = await fetch(
    `https://graph.facebook.com/v20.0/${leadgenId}?fields=field_data&access_token=${encodeURIComponent(pageAccessToken)}`
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Leadgen fetch failed: ${res.status} ${body}`);
  }
  const body = await res.json();
  return (body.field_data as LeadgenField[]) || [];
}

// Standard Lead Ads fields have fixed names; anything else is a custom
// question the client added to their form, whose key varies per form. We
// keep every raw key (nothing is thrown away) and best-effort-match the
// custom ones onto the job_type/location fields the rest of the app already
// reads, by scanning for keys that look like they're asking that.
export function parseLeadgenFields(fieldData: LeadgenField[]): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const f of fieldData) raw[f.name] = f.values?.[0] || "";

  const findByHint = (...hints: string[]): string | undefined => {
    const key = Object.keys(raw).find((k) => hints.some((hint) => k.includes(hint)));
    return key ? raw[key] : undefined;
  };

  const name = raw.full_name || (raw.first_name ? `${raw.first_name}${raw.last_name ? ` ${raw.last_name}` : ""}` : undefined) || findByHint("name");
  const email = raw.email || findByHint("email");
  const phone = raw.phone_number || findByHint("phone");
  const jobType = findByHint("job_type", "job", "service");
  const location = findByHint("location", "suburb", "area", "address");

  return {
    ...raw,
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    job_type: jobType || "Facebook Lead Ad enquiry",
    location: location || "Not provided",
  };
}

export interface ResubscribeResult {
  clientName: string;
  pageId: string;
  error?: string;
}

// Meta only sends webhook fields a Page was subscribed to *at the time of
// connection* — adding a new field (e.g. "leadgen") to subscribeWebhookForPage
// does nothing for Pages that already connected before that change shipped.
// Re-running the subscribed_apps call is idempotent (it just re-asserts the
// full current field list), so looping this over every stored channel here
// keeps every client's subscription current without needing them to
// reconnect manually each time we add a new webhook field.
export async function resubscribeAllMessengerChannels(): Promise<ResubscribeResult[]> {
  const sb = createSupabaseClient();
  const { data: channels } = await sb
    .from("lq_channels")
    .select("external_page_id, credentials, lq_clients(name)")
    .eq("type", "messenger");

  const results: ResubscribeResult[] = [];
  for (const channel of channels || []) {
    const clientName = (channel.lq_clients as unknown as { name: string } | null)?.name || "unknown client";
    try {
      const token = decryptSecret(channel.credentials as unknown as Buffer);
      await subscribeWebhookForPage(channel.external_page_id, token);
      results.push({ clientName, pageId: channel.external_page_id });
    } catch (e) {
      results.push({ clientName, pageId: channel.external_page_id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
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
