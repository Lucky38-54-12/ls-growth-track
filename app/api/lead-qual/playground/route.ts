import { runTurn } from "@/lib/leadQual/conversationManager";
import { NextRequest, NextResponse } from "next/server";

// Lets you chat with a client's AI qualifier directly from the dashboard —
// no Meta webhook or real lead required to test whether the config/rules
// behave the way you expect.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { clientId, conversationId, message } = body;
  if (!clientId || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "clientId and message are required" }, { status: 400 });
  }

  try {
    const result = await runTurn({ clientId, conversationId: conversationId || null, userMessage: message });
    return NextResponse.json(result);
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
