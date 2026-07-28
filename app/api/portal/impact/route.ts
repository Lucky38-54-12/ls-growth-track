import { createSupabaseClient } from "@/lib/supabase";
import { CLIENT_COOKIE_NAME, verifyClientSessionToken } from "@/lib/leadQual/clientAuth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Rough, defensible estimate of how long a human would take to read a
// lead's message and type a reply — used to turn "AI sent N replies" into
// an actual time-saved number worth showing the client.
const MINUTES_SAVED_PER_MESSAGE = 3;

interface MessageRow {
  conversation_id: string;
  role: string;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(CLIENT_COOKIE_NAME)?.value;
  const clientId = token ? await verifyClientSessionToken(token) : null;
  if (!clientId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createSupabaseClient();

  const { data: conversations } = await sb.from("lq_conversations").select("id").eq("client_id", clientId);
  const conversationIds = (conversations || []).map((c) => c.id);

  if (conversationIds.length === 0) {
    return NextResponse.json({ messagesAutomated: 0, adminTimeSavedMinutes: 0, avgResponseSeconds: null, leadsHandled: 0 });
  }

  const { data: messages } = await sb
    .from("lq_messages")
    .select("conversation_id, role, created_at")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: true });

  const rows = (messages || []) as MessageRow[];
  const assistantCount = rows.filter((m) => m.role === "assistant").length;

  // Average time from a lead's message to the AI's next reply, across every
  // such pair in every conversation — the actual number worth showing off.
  // A handful of extreme outliers (a lead going quiet then replying hours
  // later) would otherwise skew the average, so anything over 10 minutes is
  // treated as a new exchange rather than a "response" being timed.
  const byConversation = new Map<string, MessageRow[]>();
  for (const m of rows) {
    if (!byConversation.has(m.conversation_id)) byConversation.set(m.conversation_id, []);
    byConversation.get(m.conversation_id)!.push(m);
  }
  const responseDeltas: number[] = [];
  for (const convoMessages of byConversation.values()) {
    for (let i = 0; i < convoMessages.length - 1; i++) {
      if (convoMessages[i].role === "user" && convoMessages[i + 1].role === "assistant") {
        const delta = (new Date(convoMessages[i + 1].created_at).getTime() - new Date(convoMessages[i].created_at).getTime()) / 1000;
        if (delta >= 0 && delta < 600) responseDeltas.push(delta);
      }
    }
  }
  const avgResponseSeconds = responseDeltas.length ? responseDeltas.reduce((a, b) => a + b, 0) / responseDeltas.length : null;

  return NextResponse.json({
    messagesAutomated: assistantCount,
    adminTimeSavedMinutes: assistantCount * MINUTES_SAVED_PER_MESSAGE,
    avgResponseSeconds,
    leadsHandled: conversationIds.length,
  });
}
