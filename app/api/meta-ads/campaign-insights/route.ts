import { analyzeCampaign } from "@/lib/campaignInsights";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignName, status, trade, location, spend, clicks, ctr, results, costPerResult, resultType } = body;

  if (typeof campaignName !== "string" || !campaignName.trim() || typeof trade !== "string" || !trade.trim()) {
    return NextResponse.json({ error: "campaignName and trade are required" }, { status: 400 });
  }

  try {
    const analysis = await analyzeCampaign({
      campaignName,
      status: status || "UNKNOWN",
      trade,
      location: location || "New Zealand",
      spend: Number(spend) || 0,
      clicks: Number(clicks) || 0,
      ctr: Number(ctr) || 0,
      results: results ?? null,
      costPerResult: costPerResult ?? null,
      resultType: resultType ?? null,
    });
    return NextResponse.json(analysis);
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
