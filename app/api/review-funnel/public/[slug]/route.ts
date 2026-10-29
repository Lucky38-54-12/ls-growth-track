import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public, unauthenticated lookup for the /review/[slug] page — the
// customer opening the link isn't logged into the dashboard, same reasoning
// as /api/lead-qual/public/[clientId]. Looks up the optional send row too
// (?s=<sendId>) so the page can greet the customer by name without a second
// round trip.
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sendId = request.nextUrl.searchParams.get("s");
  const sb = createSupabaseClient();

  const { data: client, error } = await sb
    .from("review_funnel_clients")
    .select("id, business_name, google_review_url")
    .eq("slug", slug)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });

  let customerName: string | null = null;
  if (sendId) {
    const { data: send } = await sb.from("review_funnel_sends").select("customer_name").eq("id", sendId).maybeSingle();
    customerName = send?.customer_name || null;
  }

  return NextResponse.json({
    businessName: client.business_name,
    googleReviewUrl: client.google_review_url,
    customerName,
  });
}
