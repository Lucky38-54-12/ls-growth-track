import { NextResponse } from "next/server";
import { sendMorningBrief } from "@/lib/morningBrief";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Manual re-run of the morning brief (Slack/ntfy/push) without waiting for
// tomorrow's 7am NZT cron. Sits behind the dashboard session cookie (see
// middleware.ts) rather than CRON_SECRET, same pattern as
// admin/run-sheet-triage — forces past the once-per-day guard.
export async function GET() {
  const result = await sendMorningBrief(true);
  return NextResponse.json(result);
}
