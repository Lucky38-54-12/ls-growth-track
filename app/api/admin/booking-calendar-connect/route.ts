import { buildBookingGoogleAuthUrl } from "@/lib/bookingCalendarAuth";
import { NextResponse } from "next/server";

// GET /api/admin/booking-calendar-connect — redirects to Google's consent
// screen. Must be completed while logged into lsgrowthagency.co@gmail.com in
// the browser, not Lucky's personal account. Behind the normal dashboard
// session (not in middleware.ts's PUBLIC_PATHS). Linked from /settings.
export async function GET() {
  return NextResponse.redirect(buildBookingGoogleAuthUrl());
}
