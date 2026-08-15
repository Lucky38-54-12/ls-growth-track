import { createSupabaseClient } from "@/lib/supabase";
import { generateAndSaveAdConcepts, AdConcept } from "@/lib/campaignAds";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Generates (or regenerates) the 3 ad concepts for this brief's client.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseClient();

  const { data: existing, error: fetchError } = await sb
    .from("campaign_briefs")
    .select("client_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 400 });
  if (!existing) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

  try {
    const brief = await generateAndSaveAdConcepts(existing.client_id);
    return NextResponse.json({ brief });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}

// Manual edits to the 3 generated ad concepts.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseClient();
  const body = await request.json();

  const ads = body.ad_concepts;
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

  const { data, error } = await sb
    .from("campaign_briefs")
    .update({ ad_concepts: cleaned, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ brief: data });
}
