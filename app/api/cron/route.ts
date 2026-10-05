import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { sendNextStepFor } from "@/lib/sendPipeline";
import { reportAutomationStatus } from "@/lib/automationStatus";
import { Lead } from "@/lib/types";

// Vercel Hobby kills functions well before a large due-batch (each lead costs
// an AI draft + AI quality check + Resend send, ~10-15s) could ever finish —
// stop cleanly with time to spare and let the next run pick up wherever this
// one left off, instead of Vercel silently killing the whole batch mid-loop
// with no result ever recorded for the leads still in flight.
export const maxDuration = 60;
// The budget check only runs *before* a worker picks up a new lead, not
// during — and a single lead (AI draft + Resend send) has taken up to ~30s
// in practice. Concurrency doesn't change that per-lead worst case, it just
// runs several of them at once, so the same 25s/35s-margin reasoning as the
// old sequential version still applies: once the checkpoint trips, the
// slowest lead already in flight needs up to ~30s more to finish, and
// 25s + 30s stays under the 60s ceiling with room to spare. (50s was tried
// and got killed by Vercel's hard ceiling mid-lead, confirmed in production.)
const TIME_BUDGET_MS = 25_000;
// Leads are independent — each is its own AI call + Resend send with no
// shared state — so processing several at once is what actually lets one
// 60s-capped run get through a real batch instead of crawling at ~2-3
// sequential leads/run. Capped at 6 to stay well under Anthropic's and
// Resend's per-minute rate limits rather than firing 50 requests at once.
const CONCURRENCY = 6;
// 2026-10-04: GitHub Actions' campaign-send job now loops this endpoint,
// passing down how many sends are still needed so a "batch of 50" completes
// across several sub-60s calls instead of needing one impossibly long one.
// Defaults to 10 for a safety net if ever called without the param (e.g. a
// future scheduled run) — the batch workflow always passes an explicit value.
const DEFAULT_TARGET_SENT = 10;

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

  // Only leads attached to an active campaign can ever send (sendNextStepFor
  // re-checks this too) — fetching and looping every lead in the table,
  // campaign or not, meant the fixed 25s budget got eaten by real sends
  // before the loop reached leads later in lead_id order, which starved
  // them permanently since the scan starts from the same spot every day.
  // Filtering to active-campaign leads up front keeps the whole reachable
  // set small enough to actually get through every run.
  const { data: activeCampaigns } = await sb.from("campaigns").select("id").eq("status", "active");
  const activeCampaignIds = (activeCampaigns || []).map((c) => c.id);

  // Explicit order is required, not cosmetic: fetchAllRows pages this in
  // 1000-row chunks via .range(), and without ORDER BY, Postgres doesn't
  // guarantee the same row lands on the same page across separate requests
  // (row updates mid-day can shift physical scan order) — confirmed via a
  // real run where a due lead got skipped entirely because it landed on a
  // different page than the previous run. Sorting by lead_id makes paging
  // deterministic across runs, so a lead that's due either gets reached or
  // doesn't based on the time budget, never based on incidental row order.
  const leads = activeCampaignIds.length
    ? await fetchAllRows<Lead>((from, to) =>
        sb.from("leads").select("*").in("campaign_id", activeCampaignIds).order("lead_id", { ascending: true }).range(from, to))
    : [];

  const today = new Date().toISOString().split("T")[0];
  const targetSent = Number(req.nextUrl.searchParams.get("target")) || DEFAULT_TARGET_SENT;
  let sent = 0, held = 0, notAFit = 0, processed = 0;
  const errors: { lead_id: string; message: string }[] = [];
  let ranOutOfTime = false;
  let nextIndex = 0;

  // Simple worker-pool: CONCURRENCY workers pull the next lead off the
  // shared queue as soon as they're free, instead of waiting in lockstep —
  // this is what actually uses the 60s window efficiently (one slow lead
  // with a web search doesn't stall the other 5). Safe with no locking:
  // `nextIndex++` and the counter increments below all run as synchronous
  // statements with no `await` in between, so JS's single-threaded event
  // loop never interleaves two workers mid-statement.
  async function worker() {
    while (true) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) { ranOutOfTime = true; return; }
      if (sent >= targetSent) return; // caller's batch target reached — let the rest of this run stop early
      const i = nextIndex++;
      if (i >= leads.length) return;
      const lead = leads[i];
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
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  await reportAutomationStatus(
    sb,
    "campaign-send-pipeline",
    errors.length > 0 ? "error" : "ok",
    `Processed ${processed} of ${leads.length} due leads: ${sent} sent, ${held} held, ${notAFit} not-a-fit, ${errors.length} failed.` +
      (ranOutOfTime ? " Ran out of time budget — remainder picks up next run." : "")
  );

  return NextResponse.json({
    sent, failed: errors.length, held, notAFit, errors, date: today,
    processed, totalLeads: leads.length, ranOutOfTime, targetSent,
  });
}
