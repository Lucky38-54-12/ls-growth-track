import { createSupabaseClient } from "@/lib/supabase";
import { sendReviewReferralAlertEmail } from "@/lib/email";
import { appendLeadToSheet } from "@/lib/metaLeadsSheetSync";
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
    .select("id, business_name, owner_email, spreadsheet_id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: referral } = await sb
    .from("review_funnel_referrals")
    .insert({
      review_funnel_client_id: client.id,
      send_id: sendId || null,
      customer_name: customerName,
      referral_name: referralName,
      referral_contact: referralContact,
    })
    .select("id")
    .single();

  await sendReviewReferralAlertEmail({
    ownerEmail: client.owner_email,
    businessName: client.business_name,
    customerName,
    referralName,
    referralContact,
  });

  // Best-effort — lands the referral in the client's existing leads
  // spreadsheet, in a "Referral Leads" tab alongside their Meta leads, if
  // one's been linked for this client. Never blocks the response on this:
  // the referral is already saved and the owner already emailed above.
  if (client.spreadsheet_id && referral) {
    const looksLikeEmail = referralContact.includes("@");
    // Awaited (not fire-and-forget) — a serverless function can be frozen
    // the instant the response is sent, which would silently drop an
    // un-awaited write.
    try {
      await appendLeadToSheet(client.spreadsheet_id, "Referral Leads", {
        leadId: `ref:${referral.id}`,
        name: referralName,
        phone: looksLikeEmail ? "" : referralContact,
        email: looksLikeEmail ? referralContact : "",
        details: customerName ? `Referred by ${customerName}` : "Referred by a customer",
        sourceTab: "Referral",
      });
    } catch (err) {
      console.error("appendLeadToSheet (referral) failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
