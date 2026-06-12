import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7",
  "base64"
);

export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get("id");
  if (leadId) {
    try {
      const sb = createSupabaseClient();
      const userAgent = req.headers.get("user-agent");
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
      await sb.from("email_events").insert({ lead_id: leadId, event_type: "open", user_agent: userAgent, ip });
    } catch {}
  }
  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
}
