import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { getTranscript } from "@/lib/fireflies";
import { logSalesCall } from "@/lib/logSalesCall";

interface FirefliesWebhookPayload {
  meetingId?: string;
  eventType?: string;
}

// Fireflies signs every webhook with an x-hub-signature header: a hex
// HMAC-SHA256 of the raw request body, keyed with the secret set in its
// Developer Settings — same scheme as the existing Meta webhook
// (lib/leadQual/meta.ts verifyMetaSignature), just without Meta's "sha256="
// prefix on the header value.
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const secret = process.env.FIREFLIES_WEBHOOK_SECRET;
  if (!secret) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
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
  const rawBody = await request.text();
  // TEMP DEBUG: Fireflies' newer webhook UI may not match the older
  // x-hub-signature docs — log everything once so we can see the real shape
  // of a test event, then remove this.
  console.log("fireflies webhook debug", {
    headers: Object.fromEntries(request.headers.entries()),
    body: rawBody,
  });
  if (!verifySignature(rawBody, request.headers.get("x-hub-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as FirefliesWebhookPayload;
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
