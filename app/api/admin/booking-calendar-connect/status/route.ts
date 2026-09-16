import { getBookingGoogleConnectionStatus } from "@/lib/bookingCalendarAuth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getBookingGoogleConnectionStatus();
  return NextResponse.json(status);
}
