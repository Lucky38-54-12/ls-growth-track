import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { stillHeld } from "@/lib/leads";
import { EmailCheck, EmailSend, TrackedSheet } from "@/lib/types";

export const dynamic = "force-dynamic";

// Read-only diagnostics for the daily monitor routine — deliberately exposes
// no write path, so the monitor only ever needs this bearer secret, never
// direct Supabase credentials. Surfaces the two failure modes that are
// otherwise invisible without opening the dashboard: emails stuck in
// rejection loops, and a sheet sync that's silently stopped running.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createSupabaseClient();

  const [{ data: checks }, { data: sends }, { data: sheets }] = await Promise.all([
    sb.from("email_checks").select("*").order("created_at", { ascending: false }),
    sb.from("email_sends").select("*"),
    sb.from("tracked_sheets").select("*").eq("active", true),
  ]);

  const allChecks = (checks || []) as EmailCheck[];
  const allSends = (sends || []) as EmailSend[];
  const rejected = allChecks.filter((c) => c.verdict === "rejected");
  const stuck = stillHeld(rejected, allSends);

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const stuckOverADay = stuck.filter((c) => new Date(c.created_at).getTime() < oneDayAgo);

  const staleSheets = ((sheets || []) as TrackedSheet[]).filter((s) => {
    if (!s.last_synced_at) return true;
    return Date.now() - new Date(s.last_synced_at).getTime() > 2 * 24 * 60 * 60 * 1000;
  });

  return NextResponse.json({
    stuck_held_emails: stuck.length,
    stuck_over_24h: stuckOverADay.length,
    stuck_examples: stuckOverADay.slice(0, 5).map((c) => ({
      lead_id: c.lead_id,
      step: c.step,
      created_at: c.created_at,
      reasoning: c.reasoning,
    })),
    stale_sheet_syncs: staleSheets.map((s) => ({
      sheet_id: s.sheet_id,
      last_synced_at: s.last_synced_at,
    })),
  });
}
