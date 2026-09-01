import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { chatWithCreativeBrain, CreativeBrainChatTurn } from "@/lib/creativeBrainChat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Persists both sides of the turn to brain_messages, same shared table the
// general /dashboard/brain chat uses (see supabase_migration_brain_conversations.sql
// + the kind/client_id columns added for this) so history survives a
// refresh and old threads can be reopened.
async function persistTurn(sb: ReturnType<typeof createSupabaseClient>, conversationId: string, userMessage: string, assistantReply: string) {
  await sb.from("brain_messages").insert([
    { conversation_id: conversationId, role: "user", content: userMessage, attachment_names: [] },
    { conversation_id: conversationId, role: "assistant", content: assistantReply, attachment_names: [] },
  ]);

  const { data: convo } = await sb.from("brain_conversations").select("title").eq("id", conversationId).maybeSingle();
  const updates: { updated_at: string; title?: string } = { updated_at: new Date().toISOString() };
  if (!convo?.title || convo.title === "New chat") {
    updates.title = userMessage.slice(0, 60) + (userMessage.length > 60 ? "…" : "");
  }
  await sb.from("brain_conversations").update(updates).eq("id", conversationId);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clientId: string = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const message: string = typeof body.message === "string" ? body.message.trim() : "";
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });

  const sb = createSupabaseClient();

  let conversationId: string = body.conversationId || "";
  if (!conversationId) {
    const { data: created, error } = await sb
      .from("brain_conversations")
      .insert({ title: "New chat", kind: "creative_brain", client_id: clientId })
      .select("id")
      .single();
    if (error || !created) return NextResponse.json({ error: "Could not start a new conversation." }, { status: 500 });
    conversationId = created.id;
  }

  const { data: priorRows } = await sb
    .from("brain_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  const history = (priorRows || []) as CreativeBrainChatTurn[];

  try {
    const { reply, bankedLearning } = await chatWithCreativeBrain(clientId, message, history);
    await persistTurn(sb, conversationId, message, reply);
    return NextResponse.json({ conversationId, reply, bankedLearning });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong." }, { status: 500 });
  }
}
