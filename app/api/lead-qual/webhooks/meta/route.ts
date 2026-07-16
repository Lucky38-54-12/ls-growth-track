import { runTurn } from "@/lib/leadQual/conversationManager";
import { resolveChannelByPageId, sendMessengerReply, verifyMetaSignature } from "@/lib/leadQual/meta";
import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// Meta's one-time webhook verification handshake (GET), separate from the
// actual message delivery (POST) below.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

interface MessengerEvent {
  sender: { id: string };
  recipient: { id: string };
  message?: { mid: string; text?: string; is_echo?: boolean; app_id?: number };
}

// Messages we send via sendMessengerReply() come back through the webhook as
// echoes tagged with our own app_id — those are just confirmation, not new
// information. An echo with no app_id (or a different one) was sent by a
// human typing directly into the Page's Messenger inbox, i.e. a staff member
// has taken over the conversation and the AI needs to back off.
function isHumanStaffEcho(event: MessengerEvent): boolean {
  if (!event.message?.is_echo) return false;
  const ourAppId = process.env.META_APP_ID;
  return String(event.message.app_id || "") !== ourAppId;
}

// Meta retries a webhook on any non-2xx or slow response, so every event
// must be deduped on its own message id before we act on it twice.
async function alreadyProcessed(mid: string): Promise<boolean> {
  const sb = createSupabaseClient();
  const { data } = await sb.from("lq_messages").select("id").eq("meta_message_id", mid).maybeSingle();
  return !!data;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  if (payload.object !== "page") return NextResponse.json({ ok: true });

  for (const entry of payload.entry || []) {
    for (const event of (entry.messaging || []) as MessengerEvent[]) {
      const text = event.message?.text;
      if (!text) continue; // skip delivery/read receipts, attachments, etc. for now
      if (event.message?.mid && (await alreadyProcessed(event.message.mid))) continue;

      // Echoes of our own AI-sent replies carry our app_id and need no
      // action — they're just Meta confirming delivery of a message we
      // already logged when runTurn() generated it.
      if (event.message?.is_echo && !isHumanStaffEcho(event)) continue;

      if (isHumanStaffEcho(event)) {
        // A staff member replied directly in the Page inbox: sender is the
        // Page, recipient is the lead (opposite of a normal inbound message).
        const channel = await resolveChannelByPageId(event.sender.id);
        if (!channel) continue;

        const sb = createSupabaseClient();
        const { data: existing } = await sb
          .from("lq_conversations")
          .select("id")
          .eq("client_id", channel.clientId)
          .eq("channel_id", channel.channelId)
          .contains("contact", { psid: event.recipient.id })
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!existing) continue; // human messaged a lead with no AI conversation on record

        await sb.from("lq_messages").insert({
          conversation_id: existing.id,
          role: "staff",
          content: text,
          meta_message_id: event.message?.mid || null,
        });
        await sb.from("lq_conversations").update({ paused_at: new Date().toISOString() }).eq("id", existing.id);
        continue;
      }

      const channel = await resolveChannelByPageId(event.recipient.id);
      if (!channel) continue; // page not connected to any client — nothing to do

      const sb = createSupabaseClient();
      // Match this lead's most recent conversation regardless of status —
      // otherwise a lead who messages again after being qualified/nurtured
      // finds no "active" row and silently starts a brand new conversation
      // with no history, causing the AI to re-greet and re-run qualification
      // from scratch.
      const { data: existing } = await sb
        .from("lq_conversations")
        .select("id")
        .eq("client_id", channel.clientId)
        .eq("channel_id", channel.channelId)
        .contains("contact", { psid: event.sender.id })
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      try {
        const result = await runTurn({
          clientId: channel.clientId,
          conversationId: existing?.id || null,
          userMessage: text,
          channelId: channel.channelId,
          contact: { psid: event.sender.id },
          metaMessageId: event.message?.mid,
        });
        if (result.reply) await sendMessengerReply(channel.pageAccessToken, event.sender.id, result.reply);
      } catch (err) {
        console.error("lead-qual meta webhook turn failed", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
