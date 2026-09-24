import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClientAsync, fetchAllRows } from "@/lib/supabase";
import { syncMetaLeadsSheet } from "@/lib/metaLeadsSheetSync";

export const dynamic = "force-dynamic";

interface LeadSheetSync {
  id: string;
  client_name: string;
  spreadsheet_id: string;
  target_tab: string;
}

// Loops every client in lead_sheet_syncs — new Meta leads should get called
// same-day, so this runs on a short cadence via cron-job.org (see CLAUDE.md
// — GitHub Actions leaves multi-hour dead spots on sub-hourly schedules,
// same reason calendar-sync and the lead-qual reminders live there instead).
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = await createSupabaseClientAsync();
  const syncs = await fetchAllRows<LeadSheetSync>((from, to) =>
    sb.from("lead_sheet_syncs").select("id, client_name, spreadsheet_id, target_tab").range(from, to)
  );

  const results: Record<string, unknown>[] = [];
  for (const s of syncs) {
    try {
      const result = await syncMetaLeadsSheet(s.spreadsheet_id, s.target_tab);
      await sb
        .from("lead_sheet_syncs")
        .update({ last_synced_at: new Date().toISOString(), last_sync_added: result.added, last_sync_error: null })
        .eq("id", s.id);
      results.push({ client: s.client_name, ...result });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sync failed";
      console.error("sync-lead-sheets failed for", s.client_name, e);
      await sb.from("lead_sheet_syncs").update({ last_synced_at: new Date().toISOString(), last_sync_error: message }).eq("id", s.id);
      results.push({ client: s.client_name, error: message });
    }
  }

  return NextResponse.json({ ok: true, results });
}
