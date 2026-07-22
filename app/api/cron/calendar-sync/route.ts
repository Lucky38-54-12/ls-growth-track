import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { syncCalendarBookings } from "@/lib/calendarSync";

// Automated meeting-day reminder + pre-call value touchpoint (sendMeetingTouchpoints)
// were turned off — Lucky wants to send those manually via the Remind button on
// Today instead of having them fire automatically off the calendar.
async function run() {
  try {
    const sync = await syncCalendarBookings();
    return NextResponse.json({ sync });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not sync calendar" }, { status: 400 });
  }
}

export async function GET() {
  return run();
}

export async function POST() {
  return run();
}
