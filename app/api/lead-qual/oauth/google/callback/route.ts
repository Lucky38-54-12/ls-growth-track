import { exchangeCodeAndStore } from "@/lib/leadQual/googleCalendar";
import { exchangeCodeAndStoreForLucky } from "@/lib/luckyGoogleAuth";
import { checkAndNotifyOnboardingComplete } from "@/lib/leadQual/onboardingNotify";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const clientId = searchParams.get("state"); // lq_clients.id, round-tripped via `state` — or "lucky" for Lucky's own connection (see lib/luckyGoogleAuth.ts), which reuses this exact route/redirect URI to avoid needing a second one registered in Google Cloud Console.
  const error = searchParams.get("error");

  if (clientId === "lucky") {
    if (error) return NextResponse.redirect(`${origin}/settings?googleError=${encodeURIComponent(error)}`);
    if (!code) return NextResponse.redirect(`${origin}/settings?googleError=missing_code`);
    try {
      await exchangeCodeAndStoreForLucky(code);
      return NextResponse.redirect(`${origin}/settings?googleConnected=1`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_error";
      return NextResponse.redirect(`${origin}/settings?googleError=${encodeURIComponent(message)}`);
    }
  }

  // Clients complete this flow themselves from the public /connect/[clientId]
  // page (see middleware.ts public paths) — send them back there, not to the
  // internal dashboard they have no login for.
  if (error && clientId) {
    return NextResponse.redirect(`${origin}/connect/${clientId}?calendarError=${encodeURIComponent(error)}`);
  }
  if (!code || !clientId) {
    return NextResponse.redirect(`${origin}/dashboard/onboarding?error=missing_code_or_client`);
  }

  try {
    await exchangeCodeAndStore(clientId, code);
    await checkAndNotifyOnboardingComplete(clientId).catch(() => {});
    return NextResponse.redirect(`${origin}/connect/${clientId}?calendarConnected=1`);
  } catch (err) {
    // Supabase/Postgrest errors are plain objects with a `.message`, not
    // Error instances — see the matching note in the Facebook callback,
    // same masking bug applies here to the lq_calendar_connections upsert.
    const message =
      err instanceof Error ? err.message
      : (err && typeof err === "object" && "message" in err) ? String((err as { message: unknown }).message)
      : "unknown_error";
    return NextResponse.redirect(`${origin}/connect/${clientId}?calendarError=${encodeURIComponent(message)}`);
  }
}
