import { NextRequest, NextResponse } from "next/server";
import { analyzeClientPerformance } from "@/lib/performanceBrain";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const clientId = body.clientId;
  if (!clientId || typeof clientId !== "string") {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  try {
    const result = await analyzeClientPerformance(clientId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to analyze performance." }, { status: 500 });
  }
}
