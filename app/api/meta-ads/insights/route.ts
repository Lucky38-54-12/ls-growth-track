import { getCampaignInsights } from "@/lib/metaAds";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account") || process.env.META_AD_ACCOUNT_ID;
  const datePreset = searchParams.get("date_preset") || "last_30d";

  if (!accountId) {
    return NextResponse.json({ error: "No ad account configured — set META_AD_ACCOUNT_ID or pass ?account=" }, { status: 400 });
  }

  try {
    const campaigns = await getCampaignInsights(accountId, datePreset);
    return NextResponse.json({ campaigns });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
