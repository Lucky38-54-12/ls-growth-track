import { createSupabaseClient } from "@/lib/supabase";
import { getAdSets } from "@/lib/metaAds";
import { NextRequest, NextResponse } from "next/server";

// Populates the ad-set picker for Stage 06 launch — we never auto-create a
// campaign/ad set, Lucky always picks an existing one to launch into.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });

  const sb = createSupabaseClient();
  const { data: client } = await sb.from("lq_clients").select("meta_ad_account_id").eq("id", clientId).maybeSingle();
  if (!client?.meta_ad_account_id) return NextResponse.json({ error: "This client has no Meta ad account linked" }, { status: 400 });

  try {
    const adSets = await getAdSets(client.meta_ad_account_id as string);
    return NextResponse.json({ adSets });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
