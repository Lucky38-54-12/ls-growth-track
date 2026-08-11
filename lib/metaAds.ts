const GRAPH_VERSION = "v20.0";

export interface CampaignInsight {
  id: string;
  name: string;
  status: string;
  objective: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  results: number | null;
  costPerResult: number | null;
  resultType: string | null;
}

interface GraphInsightRow {
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  actions?: { action_type: string; value: string }[];
  cost_per_action_type?: { action_type: string; value: string }[];
}

interface GraphCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  insights?: { data: GraphInsightRow[] };
}

// Meta's "results" metric depends on the campaign objective — leads, purchases,
// messaging conversations, etc all live under actions[] with different
// action_types, so we take the one with the highest value as the best guess
// at "the metric this campaign is optimizing for."
function pickPrimaryResult(row: GraphInsightRow | undefined): { count: number | null; costPer: number | null; type: string | null } {
  if (!row?.actions?.length) return { count: null, costPer: null, type: null };
  const preferredTypes = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "purchase", "onsite_conversion.messaging_conversation_started_7d"];
  const best = row.actions.find((a) => preferredTypes.includes(a.action_type))
    || [...row.actions].sort((a, b) => Number(b.value) - Number(a.value))[0];
  if (!best) return { count: null, costPer: null, type: null };
  const costRow = row.cost_per_action_type?.find((c) => c.action_type === best.action_type);
  return { count: Number(best.value), costPer: costRow ? Number(costRow.value) : null, type: best.action_type };
}

export async function getCampaignInsights(adAccountId: string, datePreset = "last_30d"): Promise<CampaignInsight[]> {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("META_SYSTEM_USER_TOKEN env var is not set");

  const accountId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const fields = `id,name,status,objective,insights.date_preset(${datePreset}){spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type}`;
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${accountId}/campaigns?fields=${encodeURIComponent(fields)}&limit=200&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Meta API error");

  const campaigns: GraphCampaign[] = data.data || [];

  return campaigns.map((c) => {
    const row = c.insights?.data?.[0];
    const primary = pickPrimaryResult(row);
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      spend: Number(row?.spend || 0),
      impressions: Number(row?.impressions || 0),
      clicks: Number(row?.clicks || 0),
      ctr: Number(row?.ctr || 0),
      cpc: Number(row?.cpc || 0),
      results: primary.count,
      costPerResult: primary.costPer,
      resultType: primary.type,
    };
  }).sort((a, b) => b.spend - a.spend);
}
