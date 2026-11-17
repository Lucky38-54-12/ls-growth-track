import { confirmDiscoveredPage } from "@/lib/leadQual/meta";
import { checkAndNotifyOnboardingComplete } from "@/lib/leadQual/onboardingNotify";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { clientId } = await request.json();
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });

  try {
    await confirmDiscoveredPage(params.id, clientId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  await checkAndNotifyOnboardingComplete(clientId).catch(() => {});
  return NextResponse.json({ ok: true });
}
