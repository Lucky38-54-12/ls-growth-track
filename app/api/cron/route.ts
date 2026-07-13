import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { sendNextStepFor } from "@/lib/sendPipeline";
import { Lead } from "@/lib/types";

// Vercel Hobby kills functions well before a large due-batch (each lead costs
// an AI draft + AI quality check + Resend send, ~10-15s) could ever finish —
// stop cleanly with time to spare and let the next run pick up wherever this
// one left off, instead of Vercel silently killing the whole batch mid-loop
// with no result ever recorded for the leads still in flight.
export const maxDuration = 60;
// The budget check only runs *before* starting a lead, not during — and a
// single lead (AI draft + AI quality check + Resend send) has taken up to
// ~30s in practice. 50s left too little headroom and got killed by Vercel's
// hard 60s ceiling mid-lead (confirmed via a real timeout in production).
// 25s leaves room for one more worst-case lead to finish under the ceiling.
const TIME_BUDGET_MS = 25_000;

// Called by GitHub Actions daily at 8am NZT (20:00 UTC) — see
// .github/workflows/cron.yml. Vercel's own Cron Jobs never actually
// registered these routes (confirmed via Observability > Cron Jobs showing
// zero invocations), so GitHub Actions triggers this endpoint instead.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const sb = createSupabaseClient();
  // Explicit order is required, not cosmetic: fetchAllRows pages this in
  // 1000-row chunks via .range(), and without ORDER BY, Postgres doesn't
  // guarantee the same row lands on the same page across separate requests
  // (row updates mid-day can shift physical scan order) — confirmed via a
  // real run where a due lead got skipped entirely because it landed on a
  // different page than the previous run. Sorting by lead_id makes paging
  // deterministic across runs, so a lead that's due either gets reached or
  // doesn't based on the time budget, never based on incidental row order.
  const leads = await fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").order("lead_id", { ascending: true }).range(from, to));

  const today = new Date().toISOString().split("T")[0];
  let sent = 0, held = 0, notAFit = 0, processed = 0;
  const errors: { lead_id: string; message: string }[] = [];
  let ranOutOfTime = false;

  for (const lead of leads) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      ranOutOfTime = true;
      break;
    }
    processed++;
    try {
      const result = await sendNextStepFor(lead, sb);
      if (result.sent) sent++;
      else if (result.held) held++;
      else if (result.notAFit) notAFit++;
    } catch (err) {
      errors.push({
        lead_id: lead.lead_id,
        message: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  return NextResponse.json({
    sent, failed: errors.length, held, notAFit, errors, date: today,
    processed, totalLeads: leads.length, ranOutOfTime,
  });
}
