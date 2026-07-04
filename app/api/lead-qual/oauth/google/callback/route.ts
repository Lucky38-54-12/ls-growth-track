import { exchangeCodeAndStore } from "@/lib/leadQual/googleCalendar";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const clientId = searchParams.get("state"); // lq_clients.id, round-tripped via `state`
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${origin}/dashboard/lead-qual?error=${encodeURIComponent(error)}`);
  }
  if (!code || !clientId) {
    return NextResponse.redirect(`${origin}/dashboard/lead-qual?error=missing_code_or_client`);
  }

  try {
    await exchangeCodeAndStore(clientId, code);
    return NextResponse.redirect(`${origin}/dashboard/lead-qual?connected=${clientId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.redirect(`${origin}/dashboard/lead-qual?error=${encodeURIComponent(message)}`);
  }
}
