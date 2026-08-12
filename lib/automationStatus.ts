import { createSupabaseClient } from "@/lib/supabase";

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
