import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { syncLeadsFromSheet } from "@/lib/sheetSync";

// Wellington Cleaning Companies sheet — sync only, never sends emails.
const SHEET_ID = "12yHXFppiVEMckNP2JCA1-PHj-u7jRvTt7hnVl-9cGbk";
const TRADE_DEFAULT = "Cleaning";
const LOCATION_DEFAULT = "Wellington NZ";

async function runSync() {
  try {
    const result = await syncLeadsFromSheet({
      sheetId: SHEET_ID,
      tradeDefault: TRADE_DEFAULT,
      locationDefault: LOCATION_DEFAULT,
      personalize: false,
      sendFresh: false,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not sync sheet" }, { status: 400 });
  }
}

export async function GET() {
  return runSync();
}

export async function POST() {
  return runSync();
}
