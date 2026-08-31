import { createSupabaseClient } from "./supabase";
import { AdCreativeInsight } from "./metaAds";

export interface ArchivedAdCreative {
  id: string;
  client_id: string;
  ad_id: string;
  campaign_name: string | null;
  title: string | null;
  body: string | null;
  image_url: string | null;
  status: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  results: number | null;
  cost_per_result: number | null;
  result_type: string | null;
  first_seen: string;
  last_seen: string;
}

// Meta only reports what's in the current date-preset window and forgets an
// ad entirely once it's paused/deleted, so every live pull is also mirrored
// here as a permanent record — this is just recording facts (real copy, real
// numbers as last observed), not an AI judgment, so it writes directly with
// no chat_drafts approval step, same as any other read-only data mirror.
export async function syncAdCreativesArchive(clientId: string, ads: AdCreativeInsight[]): Promise<void> {
  if (!ads.length) return;
  const sb = createSupabaseClient();
  const now = new Date().toISOString();

  await sb.from("ad_creatives_archive").upsert(
    ads.map((a) => ({
      client_id: clientId,
      ad_id: a.id,
      campaign_name: a.campaignName,
      title: a.title,
      body: a.body,
      image_url: a.imageUrl,
      status: a.status,
      spend: a.spend,
      impressions: a.impressions,
      clicks: a.clicks,
      ctr: a.ctr,
      cpc: a.cpc,
      results: a.results,
      cost_per_result: a.costPerResult,
      result_type: a.resultType,
      last_seen: now,
    })),
    { onConflict: "client_id,ad_id", ignoreDuplicates: false }
  );
}

export async function getArchivedCreatives(clientId: string, limit = 200): Promise<ArchivedAdCreative[]> {
  const sb = createSupabaseClient();
  const { data } = await sb
    .from("ad_creatives_archive")
    .select("*")
    .eq("client_id", clientId)
    .order("last_seen", { ascending: false })
    .limit(limit);
  return (data || []) as ArchivedAdCreative[];
}
