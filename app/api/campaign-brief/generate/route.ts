import { generateAndSaveCampaignBrief } from "@/lib/campaignBrief";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// Several web_search rounds plus a large generation call — comparable to
// meta-ads campaign-insights, give it real headroom.
export const maxDuration = 90;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });

  try {
    const brief = await generateAndSaveCampaignBrief(clientId);
    return NextResponse.json({ brief });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "unknown_error";
    // Google API client errors carry the real reason (storageQuotaExceeded,
    // insufficientPermissions, etc) in response.data, not the top-level
    // message — logging it here since "The caller does not have permission"
    // alone isn't enough to diagnose which Google Cloud setting is missing.
    const detail = (err as { response?: { data?: unknown } })?.response?.data;
    console.error("campaign-brief generate failed:", messageText, detail ? JSON.stringify(detail) : "");
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
