import { createSupabaseClient } from "@/lib/supabase";
import { generateAndSaveAdConcepts, AdConcept } from "@/lib/campaignAds";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Generates (or regenerates) the 3 ad concepts for one service.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseClient();
  const body = await request.json().catch(() => ({}));
  const service = typeof body.service === "string" ? body.service.trim() : "";
  if (!service) return NextResponse.json({ error: "service is required" }, { status: 400 });

  const { data: existing, error: fetchError } = await sb
    .from("campaign_briefs")
    .select("client_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 400 });
  if (!existing) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

  try {
    const brief = await generateAndSaveAdConcepts(existing.client_id, service);
    return NextResponse.json({ brief });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}

// Manual edits to one service's 3 generated ad concepts.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseClient();
  const body = await request.json();

  const service = typeof body.service === "string" ? body.service.trim() : "";
  const ads = body.ad_concepts;
  if (!service) return NextResponse.json({ error: "service is required" }, { status: 400 });
  if (!Array.isArray(ads) || ads.length !== 3) {
    return NextResponse.json({ error: "ad_concepts must be an array of 3 ad concepts" }, { status: 400 });
  }
  const cleaned: AdConcept[] = ads.map((a) => ({
    angle: typeof a?.angle === "string" ? a.angle : "",
    headline: typeof a?.headline === "string" ? a.headline : "",
    primaryText: typeof a?.primaryText === "string" ? a.primaryText : "",
    creativeDirection: typeof a?.creativeDirection === "string" ? a.creativeDirection : "",
    targeting: typeof a?.targeting === "string" ? a.targeting : "",
    referenceLinks: Array.isArray(a?.referenceLinks) ? a.referenceLinks.filter((l: unknown): l is string => typeof l === "string") : [],
  }));

  const { data: existing, error: fetchError } = await sb
    .from("campaign_briefs")
    .select("service_details")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 400 });
  if (!existing) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

  const serviceDetails = { ...(existing.service_details as Record<string, Record<string, unknown>>) };
  serviceDetails[service] = { ...(serviceDetails[service] || {}), ad_concepts: cleaned };

  const { data, error } = await sb
    .from("campaign_briefs")
    .update({ service_details: serviceDetails, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ brief: data });
}
