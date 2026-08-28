import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { getTranscript } from "@/lib/fireflies";
import { logSalesCall } from "@/lib/logSalesCall";

interface FirefliesWebhookPayload {
  meetingId?: string;
  eventType?: string;
}

// Fireflies doesn't sign webhook payloads with an HMAC — it lets you attach a
// shared secret as a query param on the webhook URL you configure in its
// dashboard, so verification here is just a direct string compare.
function verifySecret(request: NextRequest): boolean {
  const configured = process.env.FIREFLIES_WEBHOOK_SECRET;
  if (!configured) return false;
  return request.nextUrl.searchParams.get("secret") === configured;
}

// Fireflies retries webhooks and fires multiple event types per meeting
// (started, processing, completed) — only a completed transcript is
// something we can actually log, and re-deliveries of the same meeting must
// not create a second sales_calls row.
async function alreadyLogged(sb: ReturnType<typeof createSupabaseClient>, meetingId: string): Promise<boolean> {
  const { data } = await sb.from("sales_calls").select("id").eq("fireflies_meeting_id", meetingId).maybeSingle();
  return !!data;
}

export async function POST(request: NextRequest) {
  if (!verifySecret(request)) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  const payload = (await request.json()) as FirefliesWebhookPayload;
  const meetingId = payload.meetingId;
  if (!meetingId) return NextResponse.json({ ok: true });

  // Fireflies' own event naming for this varies by integration version —
  // matching case-insensitively on "completed" (rather than an exact string)
  // avoids silently dropping every call if the exact label differs.
  const eventType = (payload.eventType || "").toLowerCase();
  if (eventType && !eventType.includes("completed")) {
    return NextResponse.json({ ok: true });
  }

  const sb = createSupabaseClient();
  if (await alreadyLogged(sb, meetingId)) {
    return NextResponse.json({ ok: true, skipped: "already logged" });
  }

  try {
    const { text } = await getTranscript(meetingId);
    const { call, proposal } = await logSalesCall(sb, text, "", meetingId);
    return NextResponse.json({ ok: true, call_id: call.id, proposal_id: proposal?.id || null });
  } catch (err) {
    console.error("fireflies webhook failed to log call", meetingId, err);
    return NextResponse.json({ error: "failed to log call" }, { status: 502 });
  }
}
