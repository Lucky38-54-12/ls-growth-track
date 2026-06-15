import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { syncCalendarBookings } from "@/lib/calendarSync";

async function run() {
  try {
    const result = await syncCalendarBookings();
    return NextResponse.json(result);
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
