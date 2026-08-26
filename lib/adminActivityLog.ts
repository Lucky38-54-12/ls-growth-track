import { createSupabaseClient } from "@/lib/supabase";

export interface AdminActivityEntry {
  action: string;
  target?: string;
  summary?: string;
  status?: "ok" | "error";
  details?: Record<string, unknown>;
}

// Append-only log of one-off manual actions run outside the normal
// automation pipeline (ad-hoc calendar bookings, one-off emails, etc.) —
// these don't show up in the `automations` table since that's a per-slug
// last-run snapshot, not an event log.
export async function logAdminAction(entry: AdminActivityEntry): Promise<void> {
  const sb = createSupabaseClient();
  await sb.from("admin_activity_log").insert({
    action: entry.action,
    target: entry.target || null,
    summary: entry.summary || null,
    status: entry.status || "ok",
    details: entry.details || null,
  });
}
