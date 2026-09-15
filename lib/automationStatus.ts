import { createSupabaseClient } from "@/lib/supabase";

// These three run every 15 min on cron-job.org (not GitHub Actions or Vercel
// cron — see CLAUDE.md), so a gap this wide means a run was actually missed,
// not just scheduler jitter. Checked from daily-maintenance since that's the
// one routine confirmed to run reliably inside Vercel's own cron.
const HEARTBEAT_SLUGS = ["calendar-sync", "lead-qual-callback-reminders", "check-personal-inbox"] as const;
const STALE_AFTER_MINUTES = 30;

// Flags a cron that's gone quiet — e.g. cron-job.org pausing the job after
// repeated failures, or CRON_SECRET drifting out of sync — instead of
// waiting for someone to notice a reminder email never went out.
export async function checkCronHeartbeats(sb: ReturnType<typeof createSupabaseClient>): Promise<{ stale: string[] }> {
  const { data } = await sb.from("automations").select("slug, last_run_at").in("slug", HEARTBEAT_SLUGS);
  const now = Date.now();
  const stale = HEARTBEAT_SLUGS.filter((slug) => {
    const row = data?.find((r) => r.slug === slug);
    if (!row?.last_run_at) return true;
    return (now - new Date(row.last_run_at).getTime()) / 60_000 > STALE_AFTER_MINUTES;
  });
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
