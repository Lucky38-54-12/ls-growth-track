import { buildLuckyGoogleAuthUrl } from "@/lib/luckyGoogleAuth";
import { NextResponse } from "next/server";

// GET /api/admin/google-connect — redirects Lucky to Google's consent
// screen. Behind the normal dashboard session (not in middleware.ts's
// PUBLIC_PATHS), so only reachable once already logged in. Linked from the
// "Connect Google" button on /settings.
export async function GET() {
  return NextResponse.redirect(buildLuckyGoogleAuthUrl());
}
