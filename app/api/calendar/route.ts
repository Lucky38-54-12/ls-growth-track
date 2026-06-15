import { NextRequest, NextResponse } from "next/server";
import { listCalendarEvents, getDayRangeUTC } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to (YYYY-MM-DD) are required" }, { status: 400 });
  }

  try {
    const { startISO } = getDayRangeUTC(from);
    const { endISO } = getDayRangeUTC(to);
    const events = await listCalendarEvents(startISO, endISO);
    return NextResponse.json({ events });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load calendar" }, { status: 500 });
  }
}
