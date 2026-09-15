import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { syncCalendarBookings, sendMeetingTouchpoints } from "@/lib/calendarSync";
import { createSupabaseClient } from "@/lib/supabase";
import { reportAutomationStatus } from "@/lib/automationStatus";

// syncCalendarBookings picks up new bookings + sends the confirmation email;
// sendMeetingTouchpoints (day-before + 2-hours-before reminders) re-enabled
// 2026-09-03 on a 15-min cron (see cron.yml) so both windows are reliably hit.
// Bearer-auth added at the same time — this now runs unattended on a public
// schedule instead of only via a manual admin trigger.
async function run(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const sync = await syncCalendarBookings();
    const touchpoints = await sendMeetingTouchpoints();
    await reportAutomationStatus(
      createSupabaseClient(),
      "calendar-sync",
      touchpoints.errors.length > 0 ? "error" : "ok",
      `Synced ${sync.checked}, reminders: ${touchpoints.dayBeforeSent} day-before, ${touchpoints.reminderSent} same-day, ${touchpoints.errors.length} error(s).`
    );
    return NextResponse.json({ sync, touchpoints });
  } catch (e) {
    await reportAutomationStatus(createSupabaseClient(), "calendar-sync", "error", e instanceof Error ? e.message : "Could not sync calendar");
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not sync calendar" }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
