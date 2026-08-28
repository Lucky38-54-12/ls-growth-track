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

export interface HumanTakeover {
  clientName: string;
  conversationId: string;
  message: string;
}

// humanRepliedOnFacebook only ever runs when a lead messages back in, so a
// conversation a human quietly took over stays invisible in our own system
// until (if ever) that lead sends another message. 15 of Katie's Elite
// Cleaning's conversations were found sitting in exactly this state on
// 2026-08-10, discovered only by manually running this same check against
// every conversation — nothing caught them automatically. Folded into the
// daily cron so this happens on its own from now on instead of relying on
// someone remembering to check.
export async function reconcileHumanTakeovers(): Promise<HumanTakeover[]> {
  const sb = createSupabaseClient();
  const { data: channels } = await sb
    .from("lq_channels")
    .select("id, external_page_id, credentials, client_id, lq_clients(name)")
    .eq("type", "messenger");

  const takeovers: HumanTakeover[] = [];

  for (const channel of channels || []) {
    const clientName = (channel.lq_clients as unknown as { name: string } | null)?.name || "unknown client";
    let token: string;
    try {
      token = decryptSecret(channel.credentials as unknown as Buffer);
    } catch {
      continue; // dead/undecryptable token — channel-health check already surfaces this separately
    }

    const { data: convos } = await sb
      .from("lq_conversations")
      .select("id, contact")
      .eq("client_id", channel.client_id)
      .eq("channel_id", channel.id)
      .is("paused_at", null)
      .neq("status", "needs_human");

    for (const convo of convos || []) {
      const psid = (convo.contact as { psid?: string } | null)?.psid;
      if (!psid) continue;

      const { data: assistantMsgs } = await sb
        .from("lq_messages")
        .select("content")
        .eq("conversation_id", convo.id)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(10);
      const knownTexts = (assistantMsgs || []).map((m) => m.content);

      try {
        const verify = await humanRepliedOnFacebook(channel.external_page_id, psid, token, knownTexts);
        if (verify.humanReplied) {
          await sb.from("lq_conversations").update({ paused_at: new Date().toISOString(), status: "needs_human" }).eq("id", convo.id);
          takeovers.push({ clientName, conversationId: convo.id, message: verify.message || "" });
        }
      } catch (err) {
        console.error("reconcileHumanTakeovers check failed for conversation", convo.id, err);
      }
    }
  }

  return takeovers;
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
// Facebook returns each field's key as the literal question text the client
// wrote on their form ("what_are_you_looking_to_have_done?"), so it varies
// per client and rarely contains a hint findByHint recognizes.
function humanizeFieldKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\?$/, "").replace(/^./, (c) => c.toUpperCase());
}

const KNOWN_FIELD_KEYS = new Set([
  "full_name", "first_name", "last_name", "name",
  "email", "phone_number", "phone",
  "city", "inbox_url",
]);

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
  const jobType = findByHint("job_type", "job", "service", "looking_to_have_done", "looking_to_build", "renovate");
  const location = raw.city || findByHint("location", "suburb", "area", "address", "city");

  // Whatever's left over is the client's own custom questions — the actual
  // detail a lead typed in (job description, budget, timeline) that
  // job_type/location can't reliably capture across different clients' forms
  // since the question wording differs every time. Fold it into one readable
  // note instead of silently dropping it, so it still shows up somewhere.
  const notes = Object.entries(raw)
    .filter(([k, v]) => !KNOWN_FIELD_KEYS.has(k) && v)
    .map(([k, v]) => `${humanizeFieldKey(k)}: ${v.replace(/_/g, " ")}`)
    .join("\n");

  return {
    ...raw,
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    job_type: jobType || "Facebook Lead Ad enquiry",
    location: location || "Not provided",
    ...(notes ? { notes } : {}),
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

// Page Access Tokens minted through the per-client personal OAuth flow
// (buildFacebookAuthUrl above) are tied to whichever person's Facebook
// session authorized the connection — Meta silently invalidates them the
// moment that person changes their password or gets forced into a fresh
// login, with zero warning to us (see checkMessengerChannelHealth). A
// System User token, generated once in the LS Growth Business Manager and
// never tied to a personal login, doesn't share that failure mode: as long
// as a Page has been added as a Business Manager asset and assigned to the
// System User, this mints a fresh Page token for it on demand, no OAuth
// dialog required.
export async function refreshPageTokenViaSystemUser(pageId: string): Promise<string> {
  const systemUserToken = process.env.META_SYSTEM_USER_TOKEN;
  if (!systemUserToken) throw new Error("META_SYSTEM_USER_TOKEN env var is not set");

  const res = await fetch(
    `https://graph.facebook.com/v20.0/${pageId}?fields=access_token&access_token=${encodeURIComponent(systemUserToken)}`
  );
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error(
      body?.error?.message ||
        `Failed to fetch page token via system user (page not assigned to the Business Manager's System User?): ${res.status}`
    );
  }
  return body.access_token as string;
}

// Same end state as completing the OAuth picker flow (subscribes the
// webhook, stores the new encrypted token, refreshes the client's logo) but
// sourced from the System User instead of a human clicking through Meta's
// consent screen.
export async function reconnectMessengerChannelViaSystemUser(clientId: string, pageId: string): Promise<void> {
  const pageAccessToken = await refreshPageTokenViaSystemUser(pageId);
  await connectMessengerPage(clientId, pageId, pageAccessToken);
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
// When META_SYSTEM_USER_TOKEN is configured, a dead token is auto-repaired
// right here instead of just being reported — a channel only ends up in the
// returned list if it's still broken after that attempt.
export async function checkMessengerChannelHealth(): Promise<DeadChannel[]> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_APP_ID / META_APP_SECRET env vars are not set");

  const sb = createSupabaseClient();
  const { data: channels } = await sb
    .from("lq_channels")
    .select("client_id, external_page_id, credentials, lq_clients(name)")
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
        const reason = body?.data?.error?.message || body?.error?.message || "token reported invalid";
        if (process.env.META_SYSTEM_USER_TOKEN) {
          try {
            await reconnectMessengerChannelViaSystemUser(channel.client_id, channel.external_page_id);
            continue; // repaired — don't report as dead
          } catch (repairErr) {
            dead.push({
              clientName,
              pageId: channel.external_page_id,
              reason: `${reason}; auto-reconnect via system user also failed: ${repairErr instanceof Error ? repairErr.message : String(repairErr)}`,
            });
            continue;
          }
        }
        dead.push({ clientName, pageId: channel.external_page_id, reason });
      }
    } catch (e) {
      dead.push({ clientName, pageId: channel.external_page_id, reason: `debug_token request failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  return dead;
}
