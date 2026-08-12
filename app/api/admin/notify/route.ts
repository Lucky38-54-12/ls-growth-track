import { NextRequest, NextResponse } from "next/server";
import { notifySlack } from "@/lib/slackNotify";

export const dynamic = "force-dynamic";

// Lets the daily sheet-triage cloud routine (and any other off-app process)
// post a Slack summary through the app's existing webhook, without needing
// its own Slack OAuth connection.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const text: string = body.text || "";
  if (!text.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

  await notifySlack(text);
  return NextResponse.json({ ok: true });
}
