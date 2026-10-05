// Automated circuit breaker for cold-outreach AI spend. Added 2026-10-04
// after lib/sheetSync.ts's personalization-hook call was identified as the
// main driver of a past spend spike (see project_daily_maintenance_api_spend
// memory) — that call is now capped per-run (MAX_HOOK_CALLS_PER_SYNC_RUN
// below), but nothing previously stopped the underlying $ spend itself if a
// future call site made the same mistake. This checks Anthropic's real
// billed cost for the "LS Growth Outreach" key and makes every cold-outreach
// AI call site fail safe (skip generation, fall back to the generic
// template/no-op) once today's spend crosses a hard ceiling, instead of
// relying on someone noticing the usage dashboard.
import { buildKeyUsageReport } from "./anthropicUsage";
import { createSupabaseClient } from "./supabase";
import { notifySlack } from "./slackNotify";

const DAILY_CAP_USD = 5;
const OUTREACH_KEY_LABEL = "LS Growth Outreach";

// One sheet-sync or send-cron run can touch many leads in a single
// invocation — caching for a few minutes means that run checks the real
// Anthropic cost API once, not once per lead, while still reacting quickly
// enough across separate invocations (cron runs ~daily, sheet syncs are
// comparatively rare).
let cached: { checkedAt: number; overCap: boolean } | null = null;
const CACHE_MS = 5 * 60 * 1000;

export async function isOutreachSpendOverCap(): Promise<boolean> {
  if (cached && Date.now() - cached.checkedAt < CACHE_MS) return cached.overCap;

  let overCap = false;
  try {
    const report = await buildKeyUsageReport(1);
    const today = new Date().toISOString().split("T")[0];
    const todaySpend = report.days.find((d) => d.date === today)?.byKey[OUTREACH_KEY_LABEL] || 0;
    overCap = todaySpend >= DAILY_CAP_USD;
  } catch {
    // If the usage/cost API itself is unreachable, fail open rather than
    // blocking all outreach generation on an unrelated Anthropic admin API
    // outage — the per-sync lead cap is still in place as a backstop.
    overCap = false;
  }

  cached = { checkedAt: Date.now(), overCap };
  if (overCap) await alertCapTrippedOnce();
  return overCap;
}

async function alertCapTrippedOnce(): Promise<void> {
  try {
    const sb = createSupabaseClient();
    const todayNZT = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const { data: row } = await sb.from("automations").select("last_run_at").eq("slug", "outreach-spend-cap-tripped").maybeSingle();
    const lastNZT = row?.last_run_at
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(row.last_run_at))
      : null;
    if (lastNZT === todayNZT) return; // already alerted today, don't spam

    await sb.from("automations").upsert(
      { slug: "outreach-spend-cap-tripped", name: "Outreach Spend Cap Tripped", last_run_at: new Date().toISOString(), last_status: "error", last_summary: `Hit the $${DAILY_CAP_USD}/day cap on the "${OUTREACH_KEY_LABEL}" key.` },
      { onConflict: "slug" }
    );
    await notifySlack(
      `🛑 Cold outreach AI spend hit the $${DAILY_CAP_USD}/day cap on the "${OUTREACH_KEY_LABEL}" key — personalization hooks and lead-slot extraction are falling back to generic/skipped for the rest of today. Check platform.claude.com/cost before raising the cap in lib/spendGuard.ts.`
    );
  } catch {
    // best-effort alert only — never let this break the caller's actual work
  }
}
