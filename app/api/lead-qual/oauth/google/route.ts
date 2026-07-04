import { buildGoogleAuthUrl } from "@/lib/leadQual/googleCalendar";
import { NextRequest, NextResponse } from "next/server";

// GET /api/lead-qual/oauth/google?clientId=<lq_clients.id> — redirects the
// client to Google's consent screen. Linked from the "Connect Calendar"
// button on /dashboard/lead-qual.
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId query param is required" }, { status: 400 });
  }
  return NextResponse.redirect(buildGoogleAuthUrl(clientId));
}
