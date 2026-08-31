import { getAdCreatives } from "@/lib/metaAds";
import { syncAdCreativesArchive } from "@/lib/adCreativesArchive";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account") || process.env.META_AD_ACCOUNT_ID;
  const datePreset = searchParams.get("date_preset") || "last_30d";
  const clientId = searchParams.get("clientId");

  if (!accountId) {
    return NextResponse.json({ error: "No ad account configured — set META_AD_ACCOUNT_ID or pass ?account=" }, { status: 400 });
  }

  try {
    const ads = await getAdCreatives(accountId, datePreset);
    // Best-effort: mirror this pull into the permanent archive, but never
    // let an archive write failure break the live view Lucky is looking at.
    if (clientId) syncAdCreativesArchive(clientId, ads).catch(() => {});
    return NextResponse.json({ ads });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
