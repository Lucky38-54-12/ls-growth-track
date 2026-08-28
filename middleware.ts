import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { CLIENT_COOKIE_NAME, verifyClientSessionToken } from "@/lib/leadQual/clientAuth";

const PUBLIC_PATHS = [
  "/login", "/api/login", "/api/click", "/api/open", "/api/ping", "/api/lead-qual/webhooks/meta",
  "/api/sales-calls/webhooks/fireflies",
  // Client-facing self-serve connect flow — a client completes this in their
  // own browser, logged into their own Google/Facebook account, so it can't
  // sit behind our dashboard login (see /connect/[clientId]/page.tsx).
  "/connect",
  "/api/lead-qual/public",
  "/api/lead-qual/oauth/google",
  "/api/lead-qual/oauth/facebook",
  // Logo/signature images embedded into generated Google Docs — the Docs API
  // fetches these over plain HTTP with no session cookie, so they can't sit
  // behind the dashboard login.
  "/agreement-assets",
];

// The client portal has its own login entirely separate from the internal
// dashboard's — a client is never given, and should never need, admin
// credentials. Handled before the admin-session check below so /portal
// never falls through to a redirect at the admin /login.
// /portal/onboarding/[token] is a separate, unrelated flow (a client
// confirming onboarding details after a deal closes, not the lq_clients
// leads portal) — it authenticates itself via the token in the URL
// (lib/onboardingPortalAuth.ts), so it never needs the lq_client cookie.
const PORTAL_PUBLIC_PATHS = ["/portal/login", "/portal/verify", "/portal/onboarding", "/api/portal"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/portal" || pathname.startsWith("/portal/") || pathname.startsWith("/api/portal")) {
    if (PORTAL_PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return NextResponse.next();
    }
    const clientToken = req.cookies.get(CLIENT_COOKIE_NAME)?.value;
    const clientId = clientToken ? await verifyClientSessionToken(clientToken) : null;
    if (clientId) return NextResponse.next();

    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/portal/login", req.url));
  }

  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/api/cron") ||
    // Gates itself on CRON_SECRET rather than the dashboard session cookie —
    // needs to be callable from outside a logged-in browser session. Other
    // /api/admin/* routes stay behind the session cookie (some, like
    // bulk-sheet-sync, have no auth check of their own).
    pathname === "/api/admin/scan-callback-notes" ||
    pathname === "/api/admin/rank-sheets-today" ||
    pathname === "/api/admin/rename-sheets" ||
    pathname === "/api/admin/notify" ||
    pathname === "/api/admin/automation-status"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token && (await verifySessionToken(token))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png).*)"],
};
