import { createSupabaseClient } from "@/lib/supabase";
import { defaultRules } from "@/lib/leadQual/qualification";
import { fetchWebsiteSnippet } from "@/lib/website";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("lq_client_configs")
    .select("*")
    .eq("client_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) {
    return NextResponse.json({
      config: {
        client_id: id,
        version: 0,
        business_info: {},
        services: [],
        service_areas: [],
        faqs: [],
        qualification_rules: defaultRules(),
      },
    });
  }
  return NextResponse.json({ config: data });
}

// Always inserts a new version — simple upsert-by-increment, no
// draft/publish workflow yet since nothing is client-facing until the Meta
// webhook is wired up.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseClient();
  const body = await request.json();

  const { data: latest } = await sb
    .from("lq_client_configs")
    .select("version")
    .eq("client_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const businessInfo = { ...(body.business_info || {}) };
  const websiteUrl = typeof businessInfo.website_url === "string" ? businessInfo.website_url.trim() : "";
  if (websiteUrl) {
    // Fetched once here at save time, not per AI turn — same pattern as the
    // cold-email generator: cheap to store, expensive to re-fetch on every
    // qualifying message.
    businessInfo.website_content = await fetchWebsiteSnippet(websiteUrl).catch(() => "");
  } else {
    delete businessInfo.website_content;
  }

  const { data, error } = await sb
    .from("lq_client_configs")
    .insert({
      client_id: id,
      version: (latest?.version || 0) + 1,
      status: "published",
      business_info: businessInfo,
      services: body.services || [],
      service_areas: body.service_areas || [],
      faqs: body.faqs || [],
      qualification_rules: body.qualification_rules || defaultRules(),
      published_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ config: data });
}
