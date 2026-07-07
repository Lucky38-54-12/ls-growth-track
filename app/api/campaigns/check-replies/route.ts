import { NextResponse } from "next/server";
import { checkForReplies } from "@/lib/campaignReplies";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Manual-trigger, mirrors /api/leads/from-inbox rather than running on every
// Today page load — an IMAP scan on every dashboard visit would be slow and
// hammers the Zoho account for no reason. Flipping a lead to "replied" also
// stops its campaign sequence immediately (see nextStepFor in lib/leads.ts),
// which is the actual point: a human should look at it before more AI emails
// go out to someone who already responded. Also reachable via
// /api/cron/check-replies with CRON_SECRET for the scheduled monitor agent.
export async function POST() {
  try {
    const result = await checkForReplies();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
