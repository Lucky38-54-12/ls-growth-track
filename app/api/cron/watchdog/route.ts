import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { checkCronHeartbeats } from "@/lib/automationStatus";
import { notifySlack } from "@/lib/slackNotify";

// Deliberately independent of GitHub Actions and Vercel's cron — both have
// been confirmed to silently stop firing (2026-10-20, 2026-10-27) while
// staying "active". This route only exists to answer "is anything actually
// firing on schedule", so it has to live on the one scheduler that's proven
// reliable here: cron-job.org, same as calendar-sync/lead-qual-callback-
// reminders/check-personal-inbox. Checking the watchdog from inside
// daily-maintenance (the old setup) meant the watchdog went stale right
// alongside the thing it was supposed to be watching.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createSupabaseClient();
  const { stale } = await checkCronHeartbeats(sb);

  if (stale.length > 0) {
    await notifySlack(
      `🔴 Cron watchdog: ${stale.join(", ")} hasn't reported in on schedule — reminder emails or follow-ups may be silently stalled. ` +
      `For calendar-sync/lead-qual-callback-reminders/check-personal-inbox, check the cron-job.org job history and CRON_SECRET. ` +
      `For campaign-send-pipeline/morning-brief/lead-qual-sync, check the "Daily outreach cron" workflow's Actions run history on GitHub — its scheduled trigger has gone silent before while staying "active" and accepting manual runs fine.`
    );
  }

  return NextResponse.json({ stale });
}
