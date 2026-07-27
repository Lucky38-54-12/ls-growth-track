import { verifyMagicLinkToken, createClientSessionToken, CLIENT_COOKIE_NAME } from "@/lib/leadQual/clientAuth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token = searchParams.get("token");
  if (!token) return NextResponse.redirect(`${origin}/portal/login?error=missing_token`);

  const clientId = await verifyMagicLinkToken(token);
  if (!clientId) return NextResponse.redirect(`${origin}/portal/login?error=expired_or_invalid`);

  const sessionToken = await createClientSessionToken(clientId);
  const response = NextResponse.redirect(`${origin}/portal`);
  response.cookies.set(CLIENT_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
  });
  return response;
}
