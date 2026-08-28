import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { getTranscript } from "@/lib/fireflies";
import { logSalesCall } from "@/lib/logSalesCall";
import { buildRecapEmail, pickRecapRecipients } from "@/lib/salesCallRecap";

interface FirefliesWebhookPayload {
  meeting_id?: string;
  event?: string;
}

// Fireflies signs every webhook with an x-hub-signature header shaped like
// "sha256=<hex>" — a hex HMAC-SHA256 of the raw request body, keyed with the
// secret set in its Developer Settings. Same scheme (and prefix) as the
// existing Meta webhook (lib/leadQual/meta.ts verifyMetaSignature).
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const secret = process.env.FIREFLIES_WEBHOOK_SECRET;
  if (!secret) return false;

  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
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
  if (!verifySignature(rawBody, request.headers.get("x-hub-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as FirefliesWebhookPayload;
  const meetingId = payload.meeting_id;
  if (!meetingId) return NextResponse.json({ ok: true });

  // Fireflies sends event: "meeting.transcribed" once the transcript is
  // ready — matching case-insensitively on "transcribed" (rather than an
  // exact string) avoids silently dropping calls if the exact label varies.
  const eventType = (payload.event || "").toLowerCase();
  if (eventType && !eventType.includes("transcribed")) {
    return NextResponse.json({ ok: true });
  }

  const sb = createSupabaseClient();
  if (await alreadyLogged(sb, meetingId)) {
    return NextResponse.json({ ok: true, skipped: "already logged" });
  }

  try {
    const transcript = await getTranscript(meetingId);
    const recipients = pickRecapRecipients(transcript);
    const { call, proposal } = await logSalesCall(sb, transcript.text, "", meetingId, recipients[0]);

    // Recap is drafted for every call regardless of outcome, but held as
    // pending rather than sent — Lucky reviews/edits it on the sales-calls
    // dashboard and sends it himself. A failure here must not undo the
    // sales_calls insert that already succeeded above.
    try {
      if (recipients.length > 0) {
        const { subject, html } = buildRecapEmail(transcript);
        await sb.from("sales_calls").update({
          recap_status: "pending",
          recap_subject: subject,
          recap_html: html,
          recap_recipient: recipients.join(", "),
        }).eq("id", call.id);
      }
    } catch (err) {
      console.error("fireflies webhook failed to draft call recap", meetingId, err);
    }

    return NextResponse.json({ ok: true, call_id: call.id, proposal_id: proposal?.id || null });
  } catch (err) {
    console.error("fireflies webhook failed to log call", meetingId, err);
    return NextResponse.json({ error: "failed to log call" }, { status: 502 });
  }
}
