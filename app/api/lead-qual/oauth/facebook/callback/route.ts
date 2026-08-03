import { exchangeCodeAndListPages } from "@/lib/leadQual/facebookOAuth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const clientId = searchParams.get("state");
  const error = searchParams.get("error");

  // Clients complete this flow themselves from the public /connect/[clientId]
  // page (see middleware.ts public paths) — send them back there, not to the
  // internal dashboard they have no login for.
  if (error && clientId) {
    return NextResponse.redirect(`${origin}/connect/${clientId}?fbError=${encodeURIComponent(error)}`);
  }
  if (!code || !clientId) {
    return NextResponse.redirect(`${origin}/dashboard/lead-qual?fbError=missing_code_or_client`);
  }

  try {
    const pendingId = await exchangeCodeAndListPages(clientId, code);
    return NextResponse.redirect(`${origin}/connect/${clientId}?fbPending=${pendingId}`);
  } catch (err) {
    // Supabase/Postgrest errors are plain objects with a `.message`, not
    // Error instances — `err instanceof Error` was silently swallowing them
    // into a useless "unknown_error", which is exactly what masked the
    // missing lq_pending_facebook_connections table until this got debugged
    // by hand. Fall back to stringifying the whole thing before giving up.
    const message =
      err instanceof Error ? err.message
      : (err && typeof err === "object" && "message" in err) ? String((err as { message: unknown }).message)
      : "unknown_error";
    return NextResponse.redirect(`${origin}/connect/${clientId}?fbError=${encodeURIComponent(message)}`);
  }
}
