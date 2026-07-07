import { NextRequest, NextResponse } from "next/server";
import { markLeadReplied, retrySend } from "@/lib/slackActions";

export const dynamic = "force-dynamic";

// Called by the hourly Slack-polling routine (not a real webhook — that
// routine reads Slack itself via the Slack MCP connector, decides the
// action, then hits this endpoint with the same bearer secret the other
// /api/cron/* routes use). Two actions only; resync/health/questions are
// handled by the routine calling /api/cron/sheet-sync and /api/cron/health
// directly and reasoning over the response itself.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const action = body?.action;
  const leadRef = body?.leadRef;

  if (typeof leadRef !== "string" || !leadRef.trim()) {
    return NextResponse.json({ error: "leadRef is required" }, { status: 400 });
  }

  let result: string;
  if (action === "mark_replied") {
    result = await markLeadReplied(leadRef);
  } else if (action === "retry_send") {
    result = await retrySend(leadRef);
  } else {
    return NextResponse.json({ error: "action must be mark_replied or retry_send" }, { status: 400 });
  }

  return NextResponse.json({ result });
}
