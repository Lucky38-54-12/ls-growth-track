import { NextRequest, NextResponse } from "next/server";
import { bookAndNotifyClient } from "@/lib/leadQual/bookCallback";

// Admin-only — gated by the dashboard session cookie via middleware.ts.
// Manual callback booking for a lead that came in outside the normal
// Messenger-qualified flow (e.g. phoned in), so it still lands on the
// client's own connected calendar and the client gets notified by email,
// without anyone having to run a local script.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { leadName, leadPhone, leadEmail, notes, startISO, durationMinutes, timeZone } = body;

  if (!leadName || !startISO) {
    return NextResponse.json({ error: "leadName and startISO are required" }, { status: 400 });
  }

  try {
    const { eventId, emailedTo } = await bookAndNotifyClient({
      clientId: id,
      leadName,
      leadPhone,
      leadEmail,
      notes,
      startISO,
      durationMinutes,
      timeZone,
    });
    return NextResponse.json({ eventId, emailedTo });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Booking failed" }, { status: 400 });
  }
}
