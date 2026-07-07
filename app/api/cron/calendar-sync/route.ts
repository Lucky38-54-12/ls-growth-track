import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { syncCalendarBookings, sendMeetingTouchpoints } from "@/lib/calendarSync";

async function run() {
  try {
    const sync = await syncCalendarBookings();
    const touchpoints = await sendMeetingTouchpoints();
    return NextResponse.json({ sync, touchpoints });
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
