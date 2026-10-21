import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { statusTimestampUpdates } from "@/lib/leads";

// One-click List-Unsubscribe target (RFC 8058) — mail clients that support
// it (Gmail, Yahoo, etc.) POST here automatically with no human interaction
// when a recipient hits "unsubscribe" in their mail UI, no confirmation page
// shown. Also handles a plain GET for a client that instead just navigates
// to the URL in `List-Unsubscribe`, so either path marks the lead opted out.
// Same status/unsubscribed_at shape as the reply-detected opt-out path in
// lib/campaignReplies.ts, so both routes land on identical lead state.
async function unsubscribe(leadId: string) {
  const sb = createSupabaseClient();
  await sb
    .from("leads")
    .update({ status: "not_interested", unsubscribed_at: new Date().toISOString(), ...statusTimestampUpdates("replied") })
    .eq("lead_id", leadId);
}

export async function POST(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get("id");
  if (leadId) {
    try {
      await unsubscribe(leadId);
    } catch {}
  }
  return new NextResponse(null, { status: 200 });
}

export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get("id");
  if (leadId) {
    try {
      await unsubscribe(leadId);
    } catch {}
  }
  return new NextResponse(
    "<html><body style=\"font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;padding:40px;\">You've been unsubscribed and won't receive any further emails from LS Growth.</body></html>",
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
