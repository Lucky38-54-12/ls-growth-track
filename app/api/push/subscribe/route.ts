import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Saves a browser's push subscription so lib/webPush.ts can target it later.
// Gated by the same admin session cookie as the rest of /dashboard (middleware.ts).
export async function POST(req: NextRequest) {
  try {
    const sub = await req.json();
    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }
    const sb = createSupabaseClient();
    await sb.from("push_subscriptions").upsert({ endpoint, p256dh, auth }, { onConflict: "endpoint" });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to save subscription" }, { status: 500 });
  }
}
