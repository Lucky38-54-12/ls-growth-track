import { backfillLeadsForClient } from "@/lib/leadQual/leadAdsBackfill";
import { NextRequest, NextResponse } from "next/server";

// Admin-only — gated by the regular admin session cookie via middleware.ts
// (this path isn't in PUBLIC_PATHS). Triggered manually from the client
// detail page once leads_retrieval access is approved, to pull in any Lead
// Ad form submissions that predate the Page's webhook subscription.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await backfillLeadsForClient(id);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Backfill failed" }, { status: 400 });
  }
}
