import { createSupabaseClient } from "@/lib/supabase";

// These three run every 15 min on cron-job.org (not GitHub Actions or Vercel
// cron — see CLAUDE.md), so a gap this wide means a run was actually missed,
// not just scheduler jitter. Checked from daily-maintenance since that's the
// one routine confirmed to run reliably inside Vercel's own cron.
const FIFTEEN_MIN_SLUGS = ["calendar-sync", "lead-qual-callback-reminders", "check-personal-inbox"] as const;
const STALE_AFTER_MINUTES = 30;

// These run once a day via GitHub Actions' own scheduler (cron.yml), which
// was confirmed 2026-10-20 to silently stop firing scheduled runs entirely
// for over a day (workflow stayed "active", manual/push triggers were
// unaffected — only the `schedule` event went quiet) with nothing surfacing
// the gap until follow-up emails were found stuck. A ~30hr threshold gives
// one full day's slack for GitHub's own scheduling jitter before flagging.
const DAILY_GH_ACTIONS_SLUGS = ["campaign-send-pipeline", "morning-brief", "lead-qual-sync"] as const;
const STALE_AFTER_MINUTES_DAILY = 30 * 60;

// Flags a cron that's gone quiet — e.g. cron-job.org pausing the job after
// repeated failures, CRON_SECRET drifting out of sync, or GitHub Actions'
// scheduler itself stalling — instead of waiting for someone to notice a
// reminder email or follow-up never went out.
export async function checkCronHeartbeats(sb: ReturnType<typeof createSupabaseClient>): Promise<{ stale: string[] }> {
  const allSlugs = [...FIFTEEN_MIN_SLUGS, ...DAILY_GH_ACTIONS_SLUGS];
  const { data } = await sb.from("automations").select("slug, last_run_at").in("slug", allSlugs);
  const now = Date.now();
  const checkStale = (slug: string, thresholdMinutes: number) => {
    const row = data?.find((r) => r.slug === slug);
    if (!row?.last_run_at) return true;
    return (now - new Date(row.last_run_at).getTime()) / 60_000 > thresholdMinutes;
  };
  const stale = [
    ...FIFTEEN_MIN_SLUGS.filter((slug) => checkStale(slug, STALE_AFTER_MINUTES)),
    ...DAILY_GH_ACTIONS_SLUGS.filter((slug) => checkStale(slug, STALE_AFTER_MINUTES_DAILY)),
  ];
  return { stale };
}

// Self-report a cron/routine run to the automations table so
// /dashboard/automations shows whether it's actually firing, not just that
// it's configured to. Best-effort — a failed status write should never
// break the caller's actual work.
export async function reportAutomationStatus(
  sb: ReturnType<typeof createSupabaseClient>,
  slug: string,
  status: "ok" | "error",
  summary: string
): Promise<void> {
  try {
    await sb.from("automations").update({ last_run_at: new Date().toISOString(), last_status: status, last_summary: summary }).eq("slug", slug);
  } catch {
    // best-effort
  }
}
