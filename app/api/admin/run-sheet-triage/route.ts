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
  const lines = await getColdCallSheetBrief(sb, allLeads, true);
  return NextResponse.json({ ran: true, lines });
}
