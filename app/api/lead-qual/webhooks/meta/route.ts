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
  message?: { mid: string; text?: string };
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
  console.log("lead-qual meta webhook payload", JSON.stringify(payload));
  if (payload.object !== "page") return NextResponse.json({ ok: true });

  for (const entry of payload.entry || []) {
    for (const event of (entry.messaging || []) as MessengerEvent[]) {
      const text = event.message?.text;
      if (!text) continue; // skip delivery/read receipts, attachments, etc. for now
      if (event.message?.mid && (await alreadyProcessed(event.message.mid))) continue;

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
