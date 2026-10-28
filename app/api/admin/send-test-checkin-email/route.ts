import { createSupabaseClient } from "@/lib/supabase";
import { createCheckinToken } from "@/lib/checkinPortalAuth";
import { sendClientEmail } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// TEMPORARY — one-off helper so Lucky can see a real, working check-in link
// without needing SESSION_SECRET (which Vercel stores as "sensitive" and
// never returns). Not in middleware's PUBLIC_PATHS, so it's already gated
// on the normal admin dashboard session cookie like any other /api/admin
// route — no new auth mechanism. Remove once confirmed working.
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  const to = request.nextUrl.searchParams.get("to");
  if (!clientId || !to) return NextResponse.json({ error: "clientId and to required" }, { status: 400 });

  const sb = createSupabaseClient();
  const { data: client } = await sb.from("lq_clients").select("id, name").eq("id", clientId).single();
  if (!client) return NextResponse.json({ error: "client not found" }, { status: 404 });

  const token = await createCheckinToken(clientId);
  const url = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.lsgrowth.agency"}/portal/checkin/${token}`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;max-width:560px;">
  <p style="margin:0 0 12px">Real working check-in link for ${client.name}:</p>
  <p style="margin:0 0 16px"><a href="${url}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">Tap through them here</a></p>
  <p style="margin:0;color:#6b7280;font-size:13px">This one actually opens the real page with real pending leads.</p>
</div>`;

  await sendClientEmail(to, `Real check-in link — ${client.name}`, html);
  return NextResponse.json({ ok: true, sentTo: to, checkinUrl: url });
}
