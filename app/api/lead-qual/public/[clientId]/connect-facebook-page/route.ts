import { resolvePageId, fetchPageAccessTokenViaSystemUser, connectMessengerPage } from "@/lib/leadQual/meta";
import { checkAndNotifyOnboardingComplete } from "@/lib/leadQual/onboardingNotify";
import { NextRequest, NextResponse } from "next/server";

// Public — hit from the client-facing /connect/[clientId] page once they say
// they've added LS Growth as a Business partner on their Page (see
// PageConnectCard in ConnectFlow.tsx). Unlike the ad-account partner step,
// this one IS verifiable: the System User token either can or can't pull a
// Page Access Token for the given Page, so a failure here means the partner
// grant hasn't actually landed yet, not just an unconfirmed self-report.
export async function POST(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { pageUrl } = await request.json();
  if (!pageUrl || typeof pageUrl !== "string") {
    return NextResponse.json({ error: "pageUrl is required" }, { status: 400 });
  }

  try {
    const pageId = await resolvePageId(pageUrl);
    const pageAccessToken = await fetchPageAccessTokenViaSystemUser(pageId);
    await connectMessengerPage(clientId, pageId, pageAccessToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await checkAndNotifyOnboardingComplete(clientId).catch(() => {});
  return NextResponse.json({ ok: true });
}
