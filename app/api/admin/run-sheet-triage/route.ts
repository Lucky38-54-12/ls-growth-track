import { NextResponse } from "next/server";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { getColdCallSheetBrief } from "@/lib/morningBrief";
import { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Manual re-run of the daily sheet triage (trim today's-picks back to the
// cap, top up, report coverage gaps) without waiting for tomorrow's 7am NZT
// cron. Sits behind the dashboard session cookie (see middleware.ts) rather
// than CRON_SECRET since it's meant to be triggered from a logged-in browser,
// not an external scheduler.
export async function GET() {
  const sb = createSupabaseClient();
  const allLeads = await fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").range(from, to));
  // Smaller scan budget than the cron's 45s — tagged sheets now scan first
  // (see getColdCallSheetBrief), so this run doesn't need the full budget to
  // reach all of them, and the first two attempts at this manual trigger
  // both 504'd at the 60s function ceiling: one because tagged sheets were
  // scanned last, the other because the full 45s scan plus Supabase/rename
  // overhead still ran past 60s even after that fix.
  const lines = await getColdCallSheetBrief(sb, allLeads, true, 25000);
  return NextResponse.json({ ran: true, lines });
}
