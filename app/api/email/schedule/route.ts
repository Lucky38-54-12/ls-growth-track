import { NextResponse } from "next/server";

// Disabled per Lucky's explicit instruction (2026-07-10) — this route sent
// the static, un-personalized "Queenstown Cleaning" template straight from
// Google Sheets rows, completely bypassing campaign status/campaign_id/
// lib/sendPipeline.ts. He wants every outgoing email personalized and gated
// by an active campaign, which this route could never satisfy. Do not
// re-enable without asking him.
export async function POST() {
  return NextResponse.json({ error: "Disabled — all sends must go through an active campaign (lib/sendPipeline.ts)" }, { status: 410 });
}

export async function GET() {
  return NextResponse.json({ error: "Disabled — all sends must go through an active campaign (lib/sendPipeline.ts)" }, { status: 410 });
}
