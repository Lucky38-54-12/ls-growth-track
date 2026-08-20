import { generateAndSaveCampaignBrief, buildManualCampaignBriefResult, saveCampaignBrief, ServiceCreativePlan } from "@/lib/campaignBrief";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// Strategy + market research + variable-length creative concepts now
// generate in one combined call (was two separate, smaller calls) — several
// web_search rounds plus a large generation, give it real headroom.
export const maxDuration = 150;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const service = typeof body.service === "string" ? body.service.trim() : "";
  const forceNewDoc = body.forceNewDoc === true;
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  if (!service) return NextResponse.json({ error: "service is required" }, { status: 400 });

  try {
    // manualPlan bypasses the Anthropic call entirely — used when the
    // content was written directly (e.g. by Claude in a terminal session)
    // rather than by the app's own API key, most commonly because the
    // app's Anthropic credits are the actual constraint, not the research/
    // writing work. Goes through the exact same validation + save/doc
    // pipeline as a normal generation (see lib/campaignBrief.ts).
    if (body.manualPlan && typeof body.manualPlan === "object") {
      const idealCustomer = typeof body.idealCustomer === "string" ? body.idealCustomer : "";
      const budgetTargeting = typeof body.budgetTargeting === "string" ? body.budgetTargeting : "";
      const result = await buildManualCampaignBriefResult(clientId, service, body.manualPlan as ServiceCreativePlan, idealCustomer, budgetTargeting);
      const brief = await saveCampaignBrief(clientId, service, result, { forceNewDoc });
      return NextResponse.json({ brief });
    }

    const brief = await generateAndSaveCampaignBrief(clientId, service, { forceNewDoc });
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
