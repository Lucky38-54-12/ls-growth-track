import { createLeadFromFacebookForm, runTurn } from "@/lib/leadQual/conversationManager";
import { fetchLeadgenDetails, humanRepliedOnFacebook, parseLeadgenFields, resolveChannelByPageId, sendMessengerReply, verifyMetaSignature } from "@/lib/leadQual/meta";
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
  message?: { mid: string; text?: string; is_echo?: boolean; app_id?: number; attachments?: { type: string }[] };
}

// A lead sending just a photo (no caption) arrives with no message.text at
// all — only message.attachments. Without this, the webhook silently dropped
// it entirely (see the old "skip attachments for now" comment below), which
// would strand a switchboard-upgrade conversation waiting on a photo that
// had, in fact, already arrived. We don't need the image content itself:
// Charl reviews it directly in the Facebook Page inbox before calling, so a
// placeholder is enough to keep the AI's conversation state moving.
function textForEvent(event: MessengerEvent): string | undefined {
  if (event.message?.text) return event.message.text;
  if (event.message?.attachments?.length) {
    const isImage = event.message.attachments.some((a) => a.type === "image");
    return isImage ? "[Photo attached]" : "[Attachment sent]";
  }
  return undefined;
}

interface LeadgenChange {
  field: string;
  value: { leadgen_id: string; page_id: string; form_id?: string };
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
    for (const change of (entry.changes || []) as LeadgenChange[]) {
      if (change.field !== "leadgen") continue;
      const { leadgen_id: leadgenId, page_id: pageId } = change.value || {};
      if (!leadgenId || !pageId) continue;

      const channel = await resolveChannelByPageId(pageId);
      if (!channel) continue; // page not connected to any client

      const sb = createSupabaseClient();
      const { data: existing } = await sb
        .from("lq_conversations")
        .select("id")
        .eq("client_id", channel.clientId)
        .contains("contact", { leadgen_id: leadgenId })
        .maybeSingle();
      if (existing) continue; // Meta retried this same form submission

      try {
        const fieldData = await fetchLeadgenDetails(leadgenId, channel.pageAccessToken);
        const fields = parseLeadgenFields(fieldData);
        await createLeadFromFacebookForm({ clientId: channel.clientId, channelId: channel.channelId, leadgenId, fields });
      } catch (err) {
        console.error("lead-qual meta webhook leadgen failed", err);
      }
    }

    for (const event of (entry.messaging || []) as MessengerEvent[]) {
      const text = textForEvent(event);
      if (!text) continue; // skip delivery/read receipts, etc.
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
        if (result.reply) {
          // Belt-and-suspenders: the qualification path above can spend real
          // time on calendar booking / Slack / email before getting here, so
          // paused_at is re-checked one last time right before the message
          // actually goes out to Messenger.
          const { data: stillActive } = await sb.from("lq_conversations").select("paused_at").eq("id", result.conversationId).single();

          // Hard rule: never talk over a human, and never rely solely on
          // paused_at to know one's there — that flag only gets set if the
          // echo webhook event for their reply actually arrived, which is
          // exactly what silently failed once already (see humanRepliedOnFacebook's
          // comment). This asks Facebook's own thread directly, right before
          // sending, regardless of what our own state thinks.
          let humanTookOver = !!stillActive?.paused_at;
          if (!humanTookOver) {
            try {
              const { data: recentAssistantMsgs } = await sb
                .from("lq_messages")
                .select("content")
                .eq("conversation_id", result.conversationId)
                .eq("role", "assistant")
                .order("created_at", { ascending: false })
                .limit(5);
              const knownTexts = (recentAssistantMsgs || []).map((m) => m.content);
              const verify = await humanRepliedOnFacebook(event.recipient.id, event.sender.id, channel.pageAccessToken, knownTexts);
              if (verify.humanReplied) {
                humanTookOver = true;
                console.error("lead-qual: human reply detected on Facebook that never reached our webhook, staying silent", {
                  conversationId: result.conversationId,
                  message: verify.message,
                });
                await sb.from("lq_conversations").update({ paused_at: new Date().toISOString(), status: "needs_human" }).eq("id", result.conversationId);
              }
            } catch (err) {
              // Fail CLOSED, not open: this check exists specifically because
              // trusting our own state (paused_at) once let the AI talk over
              // a human twice already. If the one thing that actually verifies
              // against Facebook can't run, silently sending anyway defeats
              // the entire point of the check — better to skip one reply and
              // flag it for a human than risk contradicting one who already
              // replied. Marked needs_human so it surfaces for review rather
              // than silently vanishing.
              humanTookOver = true;
              console.error("lead-qual meta webhook humanRepliedOnFacebook check failed, staying silent (fail closed)", err);
              await sb.from("lq_conversations").update({ status: "needs_human" }).eq("id", result.conversationId);
            }
          }

          if (!humanTookOver) {
            await sendMessengerReply(channel.pageAccessToken, event.sender.id, result.reply);
          }
        }
      } catch (err) {
        console.error("lead-qual meta webhook turn failed", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
