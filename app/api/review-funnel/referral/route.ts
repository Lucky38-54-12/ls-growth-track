import { createSupabaseClient } from "@/lib/supabase";
import { sendReviewReferralAlertEmail } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public, unauthenticated — offered to a happy customer on /review/[slug]
// right before they're sent to leave a Google review. Always optional on
// the frontend; this just logs it and alerts the owner.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const slug = body?.slug as string | undefined;
  const sendId = body?.sendId as string | undefined;
  const customerName = (body?.customerName as string | undefined)?.trim() || null;
  const referralName = (body?.referralName as string | undefined)?.trim();
  const referralContact = (body?.referralContact as string | undefined)?.trim();

  if (!slug || !referralName || !referralContact) {
    return NextResponse.json({ error: "slug, referralName and referralContact are required" }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { data: client, error } = await sb
    .from("review_funnel_clients")
    .select("id, business_name, owner_email")
    .eq("slug", slug)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });

  await sb.from("review_funnel_referrals").insert({
    review_funnel_client_id: client.id,
    send_id: sendId || null,
    customer_name: customerName,
    referral_name: referralName,
    referral_contact: referralContact,
  });

  await sendReviewReferralAlertEmail({
    ownerEmail: client.owner_email,
    businessName: client.business_name,
    customerName,
    referralName,
    referralContact,
  });

  return NextResponse.json({ ok: true });
}
