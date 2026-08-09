import { checkMessengerChannelHealth } from "@/lib/leadQual/meta";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Admin-only, read-only — gated by the regular admin session cookie via
// middleware.ts. Split out from the daily-maintenance cron (which also
// fires nurture emails, cold-call nudges, etc.) so this can be checked
// on demand without triggering those side effects.
export async function GET() {
  try {
    const dead = await checkMessengerChannelHealth();
    return NextResponse.json({ dead });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Health check failed" }, { status: 500 });
  }
}
