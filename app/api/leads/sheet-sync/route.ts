import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { syncLeadsFromSheet } from "@/lib/sheetSync";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sheetId, tradeDefault, locationDefault, personalize, sendFresh } = body as {
    sheetId: string;
    tradeDefault: string;
    locationDefault: string;
    personalize: boolean;
    sendFresh: boolean;
  };

  if (!sheetId?.trim()) {
    return NextResponse.json({ error: "Sheet ID is required" }, { status: 400 });
  }

  try {
    const result = await syncLeadsFromSheet({ sheetId, tradeDefault, locationDefault, personalize, sendFresh });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not sync sheet" }, { status: 400 });
  }
}
