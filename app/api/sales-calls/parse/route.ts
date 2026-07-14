import { NextRequest, NextResponse } from "next/server";
import { parseCallSummary } from "@/lib/salesCallsAi";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const rawSummary = body.raw_summary;

  if (!rawSummary || !String(rawSummary).trim()) {
    return NextResponse.json({ error: "Paste the call summary first." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
  }

  try {
    const parsed = await parseCallSummary(rawSummary);
    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
