import { createSupabaseClient } from "@/lib/supabase";
import { extractSpreadsheetId } from "@/lib/metaLeadsSheetSync";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Behind the dashboard session cookie (middleware default — not in
// PUBLIC_PATHS). Lucky manages the per-client review-funnel config here:
// slug, business name, Google review link, who negative feedback alerts go
// to, and optionally the same leads spreadsheet their Meta leads already
// sync to (so a referral lands in a "Referral Leads" tab there too).
export async function GET() {
  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("review_funnel_clients")
    .select("id, slug, business_name, owner_email, google_review_url, spreadsheet_id, created_at")
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
  const spreadsheetInput = (body?.spreadsheetUrl as string | undefined)?.trim() || "";
  let spreadsheetId = spreadsheetInput ? extractSpreadsheetId(spreadsheetInput) : null;

  if (!businessName || !ownerEmail || !googleReviewUrl) {
    return NextResponse.json({ error: "businessName, ownerEmail and googleReviewUrl are required" }, { status: 400 });
  }
  if (spreadsheetInput && !spreadsheetId) {
    return NextResponse.json({ error: "spreadsheetUrl doesn't look like a valid Google Sheets link or id" }, { status: 400 });
  }

  const sb = createSupabaseClient();

  // No sheet pasted — fall back to whatever's already linked for this
  // business name in lead_sheet_syncs (set up via /dashboard/lead-sheets),
  // so the two don't need the same URL pasted twice.
  if (!spreadsheetId) {
    const { data: existingSync } = await sb
      .from("lead_sheet_syncs")
      .select("spreadsheet_id")
      .ilike("client_name", businessName)
      .maybeSingle();
    if (existingSync?.spreadsheet_id) spreadsheetId = existingSync.spreadsheet_id;
  }
  const baseSlug = slugify(businessName);
  let slug = baseSlug;
  for (let i = 2; i < 50; i++) {
    const { data: existing } = await sb.from("review_funnel_clients").select("id").eq("slug", slug).maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${i}`;
  }

  const { data, error } = await sb
    .from("review_funnel_clients")
    .insert({ business_name: businessName, owner_email: ownerEmail, google_review_url: googleReviewUrl, client_id: clientId, spreadsheet_id: spreadsheetId, slug })
    .select("id, slug, business_name, owner_email, google_review_url, spreadsheet_id, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ client: data });
}

// Updates an existing client's spreadsheet link — the one field most likely
// to get added after the fact (set up the client first, link the sheet once
// you've got it handy).
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const id = (body?.id as string | undefined)?.trim();
  const spreadsheetInput = (body?.spreadsheetUrl as string | undefined)?.trim() || "";

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const spreadsheetId = spreadsheetInput ? extractSpreadsheetId(spreadsheetInput) : null;
  if (spreadsheetInput && !spreadsheetId) {
    return NextResponse.json({ error: "spreadsheetUrl doesn't look like a valid Google Sheets link or id" }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("review_funnel_clients")
    .update({ spreadsheet_id: spreadsheetId })
    .eq("id", id)
    .select("id, slug, business_name, owner_email, google_review_url, spreadsheet_id, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ client: data });
}
