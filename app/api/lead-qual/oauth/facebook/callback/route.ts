import { exchangeCodeAndListPages } from "@/lib/leadQual/facebookOAuth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const clientId = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${origin}/dashboard/lead-qual?fbError=${encodeURIComponent(error)}`);
  }
  if (!code || !clientId) {
    return NextResponse.redirect(`${origin}/dashboard/lead-qual?fbError=missing_code_or_client`);
  }

  try {
    const pendingId = await exchangeCodeAndListPages(clientId, code);
    return NextResponse.redirect(`${origin}/dashboard/lead-qual/${clientId}?fbPending=${pendingId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.redirect(`${origin}/dashboard/lead-qual?fbError=${encodeURIComponent(message)}`);
  }
}
