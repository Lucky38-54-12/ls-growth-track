import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { notifySlack } from "@/lib/slackNotify";

export const dynamic = "force-dynamic";

// Resend signs webhooks the Svix way: secret is "whsec_" + base64, and the
// signed payload is "{svix-id}.{svix-timestamp}.{raw body}", HMAC-SHA256'd
// with the base64-decoded secret, base64-encoded, compared against each
// "v1,<sig>" entry in the space-separated svix-signature header (more than
// one entry means a secret rotation grace period — any match is valid).
function verifySignature(rawBody: string, headers: { id: string | null; timestamp: string | null; signature: string | null }): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  return headers.signature.split(" ").some((entry) => {
    const sig = entry.split(",")[1];
    if (!sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

interface ResendWebhookPayload {
  type: string;
  data: {
    email_id?: string;
    to?: string[];
    bounce?: { type?: string; message?: string };
  };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const verified = verifySignature(rawBody, {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  });
  if (!verified) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const payload = JSON.parse(rawBody) as ResendWebhookPayload;
  const emailId = payload.data.email_id;
  if (!emailId) return NextResponse.json({ ok: true });

  const sb = createSupabaseClient();

  if (payload.type === "email.delivered") {
    await sb.from("email_sends")
      .update({ delivery_status: "delivered", status_updated_at: new Date().toISOString() })
      .eq("resend_id", emailId);
    return NextResponse.json({ ok: true });
  }

  if (payload.type === "email.bounced") {
    const { data: send } = await sb.from("email_sends").select("lead_id").eq("resend_id", emailId).maybeSingle();
    await sb.from("email_sends")
      .update({ delivery_status: "bounced", status_updated_at: new Date().toISOString() })
      .eq("resend_id", emailId);

    // Only a hard/permanent bounce means the address is dead — a soft/
    // transient one (mailbox full, greylisted, temp server issue) can still
    // succeed on a later send, so it just gets logged, not treated as
    // terminal.
    const isHardBounce = /perm/i.test(payload.data.bounce?.type || "");
    if (send?.lead_id && isHardBounce) {
      await sb.from("leads").update({ status: "bounced" }).eq("lead_id", send.lead_id);
      await notifySlack(
        `📪 Hard bounce — *${send.lead_id}* (${payload.data.to?.[0] || "unknown address"}) marked bounced, sequence stopped.\n` +
        `${process.env.NEXT_PUBLIC_APP_URL || "https://app.lsgrowth.agency"}/dashboard/leads/${send.lead_id}`
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (payload.type === "email.complained") {
    const { data: send } = await sb.from("email_sends").select("lead_id").eq("resend_id", emailId).maybeSingle();
    await sb.from("email_sends")
      .update({ delivery_status: "complained", status_updated_at: new Date().toISOString() })
      .eq("resend_id", emailId);

    // A spam complaint is a stronger non-consent signal than a plain
    // "not interested" reply — same status + unsubscribed_at pattern
    // campaignReplies.ts uses for that, so nextStepFor's terminal-status
    // check stops the sequence immediately either way.
    if (send?.lead_id) {
      await sb.from("leads").update({ status: "not_interested", unsubscribed_at: new Date().toISOString() }).eq("lead_id", send.lead_id);
      await notifySlack(
        `🚩 Spam complaint — *${send.lead_id}* (${payload.data.to?.[0] || "unknown address"}) marked not_interested, sequence stopped.\n` +
        `${process.env.NEXT_PUBLIC_APP_URL || "https://app.lsgrowth.agency"}/dashboard/leads/${send.lead_id}`
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
