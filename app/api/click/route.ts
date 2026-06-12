import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

const FALLBACK = "https://lsgrowth.agency";

function isSafe(url: string) {
  try {
    const p = new URL(url);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get("id");
  const raw = req.nextUrl.searchParams.get("url") || "";
  const destination = isSafe(raw) ? raw : FALLBACK;
  if (leadId) {
    try {
      const sb = createSupabaseClient();
      const userAgent = req.headers.get("user-agent");
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
      await sb.from("email_events").insert({ lead_id: leadId, event_type: "click", url: destination, user_agent: userAgent, ip });
    } catch {}
  }
  return NextResponse.redirect(destination, 302);
}
