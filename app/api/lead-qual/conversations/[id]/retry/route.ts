import { retryStalledTurn } from "@/lib/leadQual/conversationManager";
import { decryptSecret } from "@/lib/leadQual/crypto";
import { humanRepliedOnFacebook, sendMessengerReply } from "@/lib/leadQual/meta";
import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Manual recovery for a conversation whose lead message never got a reply —
// see retryStalledTurn's comment for why this can't just replay the webhook
// event. Admin-only (gated by middleware.ts like every other /api/lead-qual
// route not explicitly listed as public).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseClient();

  try {
    const result = await retryStalledTurn(id);
    if (!result.reply) {
      return NextResponse.json({ sent: false, status: result.status });
    }

    const { data: conversation } = await sb
      .from("lq_conversations")
      .select("channel_id, contact, paused_at")
      .eq("id", result.conversationId)
      .single();
    if (conversation?.paused_at) {
      return NextResponse.json({ sent: false, status: result.status, reason: "paused after retry generated a reply" });
    }

    const psid = (conversation?.contact as Record<string, unknown> | null)?.psid as string | undefined;
    if (!psid || !conversation?.channel_id) {
      return NextResponse.json({ error: "conversation has no messenger psid/channel on record" }, { status: 400 });
    }

    const { data: channel } = await sb
      .from("lq_channels")
      .select("external_page_id, credentials")
      .eq("id", conversation.channel_id)
      .single();
    if (!channel) return NextResponse.json({ error: "channel not found" }, { status: 400 });

    const pageAccessToken = decryptSecret(channel.credentials as unknown as Buffer);

    // Same fail-closed check the live webhook does right before sending —
    // don't talk over a human who replied on Facebook since this reply was
    // generated.
    const { data: recentAssistantMsgs } = await sb
      .from("lq_messages")
      .select("content")
      .eq("conversation_id", result.conversationId)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(5);
    const knownTexts = (recentAssistantMsgs || []).map((m) => m.content);
    const verify = await humanRepliedOnFacebook(channel.external_page_id, psid, pageAccessToken, knownTexts);
    if (verify.humanReplied) {
      await sb.from("lq_conversations").update({ paused_at: new Date().toISOString(), status: "needs_human" }).eq("id", result.conversationId);
      return NextResponse.json({ sent: false, status: "needs_human", reason: "human already replied on Facebook" });
    }

    await sendMessengerReply(pageAccessToken, psid, result.reply);
    return NextResponse.json({ sent: true, status: result.status, reply: result.reply });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "retry failed" }, { status: 500 });
  }
}
