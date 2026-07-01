import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7",
  "base64"
);

// Corporate security scanners that pre-fetch images before a human reads —
// filtering these avoids false open counts. Gmail's proxy (googleimageproxy)
// is intentionally NOT blocked here: Gmail only loads images when the
// recipient actually opens the email, so those hits are real opens.
const BOT_PATTERNS = [
  "google-apps-script",
  "yahoomailproxy",
  "barracudacentral",
  "mimecast",
  "proofpoint",
  "outlook safelinks",
  "preview",
  "scanner",
  "antispam",
  "antivirus",
];

function isBot(ua: string | null): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return BOT_PATTERNS.some((p) => lower.includes(p));
}

export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get("id");
  if (leadId) {
    const userAgent = req.headers.get("user-agent");
    if (!isBot(userAgent)) {
      try {
        const sb = createSupabaseClient();
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
        await sb.from("email_events").insert({ lead_id: leadId, event_type: "open", user_agent: userAgent, ip });
      } catch {}
    }
  }
  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
}
