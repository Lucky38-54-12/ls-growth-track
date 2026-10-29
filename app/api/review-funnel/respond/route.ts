import { createSupabaseClient } from "@/lib/supabase";
import { sendReviewFeedbackAlertEmail } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public, unauthenticated — the customer submitting from /review/[slug]
// isn't logged into the dashboard. Logs the response, closes out the send
// row if this came from a batch send, and for a "bad" answer alerts the
// business owner privately instead of letting it anywhere near the public
// Google review link (the whole point of the review-gating funnel).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const slug = body?.slug as string | undefined;
  const sentiment = body?.sentiment as string | undefined;
  const sendId = body?.sendId as string | undefined;
  const feedback = (body?.feedback as string | undefined)?.trim() || null;
  const customerName = (body?.customerName as string | undefined)?.trim() || null;

  if (!slug || (sentiment !== "good" && sentiment !== "bad")) {
    return NextResponse.json({ error: "slug and a valid sentiment are required" }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { data: client, error } = await sb
    .from("review_funnel_clients")
    .select("id, business_name, owner_email")
    .eq("slug", slug)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });

  await sb.from("review_funnel_responses").insert({
    review_funnel_client_id: client.id,
    send_id: sendId || null,
    customer_name: customerName,
    sentiment,
    feedback,
  });

  if (sendId) {
    await sb.from("review_funnel_sends").update({ responded_at: new Date().toISOString(), sentiment }).eq("id", sendId);
  }

  if (sentiment === "bad" && feedback) {
    await sendReviewFeedbackAlertEmail({
      ownerEmail: client.owner_email,
      businessName: client.business_name,
      customerName,
      feedback,
    });
  }

  return NextResponse.json({ ok: true });
}
