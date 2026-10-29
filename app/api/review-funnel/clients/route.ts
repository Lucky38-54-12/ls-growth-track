import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Behind the dashboard session cookie (middleware default — not in
// PUBLIC_PATHS). Lucky manages the per-client review-funnel config here:
// slug, business name, Google review link, who negative feedback alerts go to.
export async function GET() {
  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("review_funnel_clients")
    .select("id, slug, business_name, owner_email, google_review_url, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ clients: data || [] });
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const businessName = (body?.businessName as string | undefined)?.trim();
  const ownerEmail = (body?.ownerEmail as string | undefined)?.trim();
  const googleReviewUrl = (body?.googleReviewUrl as string | undefined)?.trim();
  const clientId = (body?.clientId as string | undefined)?.trim() || null;

  if (!businessName || !ownerEmail || !googleReviewUrl) {
    return NextResponse.json({ error: "businessName, ownerEmail and googleReviewUrl are required" }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const baseSlug = slugify(businessName);
  let slug = baseSlug;
  for (let i = 2; i < 50; i++) {
    const { data: existing } = await sb.from("review_funnel_clients").select("id").eq("slug", slug).maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${i}`;
  }

  const { data, error } = await sb
    .from("review_funnel_clients")
    .insert({ business_name: businessName, owner_email: ownerEmail, google_review_url: googleReviewUrl, client_id: clientId, slug })
    .select("id, slug, business_name, owner_email, google_review_url, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ client: data });
}
