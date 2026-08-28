import { createClientSessionToken, CLIENT_COOKIE_NAME } from "@/lib/leadQual/clientAuth";
import { NextRequest, NextResponse } from "next/server";

// Where this can land — kept to the known portal routes so `next` can't be
// abused as an open redirect.
const ALLOWED_NEXT = new Set(["/portal", "/portal/today", "/portal/pipeline", "/portal/calendar", "/portal/email-sequence", "/portal/chat"]);

// Admin-only shortcut into a client's own portal — gated by the regular
// admin session cookie via middleware.ts (this path isn't in PUBLIC_PATHS),
// not by anything client-facing. Mints the same session token a client gets
// from their magic-link email, just without needing to send one.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestedNext = request.nextUrl.searchParams.get("next") || "/portal";
  const next = ALLOWED_NEXT.has(requestedNext) ? requestedNext : "/portal";
  const token = await createClientSessionToken(id);
  const response = NextResponse.redirect(new URL(next, request.url));
  response.cookies.set(CLIENT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
  });
  return response;
}
