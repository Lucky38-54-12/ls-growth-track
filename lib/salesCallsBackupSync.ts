import { createSupabaseClient, fetchAllRows } from "./supabase";
import { SalesCall, ScriptVersion } from "./types";
import { backupSalesCallsToDrive, BackupResult } from "./salesCallsDrive";

// Shared by the manual "Backup to Drive" button and the automatic backup
// that fires after every call is logged — both need the exact same
// read-state, push-to-sheet, persist-state sequence.
export async function runSalesCallsBackup(): Promise<BackupResult> {
  const sb = createSupabaseClient();

  const [calls, { data: scriptVersions }, { data: state }] = await Promise.all([
    fetchAllRows<SalesCall>((from, to) =>
      sb.from("sales_calls").select("*").order("created_at", { ascending: false }).range(from, to)),
    sb.from("sales_script_versions").select("*").order("version", { ascending: false }),
    sb.from("sales_calls_backup_state").select("spreadsheet_id").eq("id", 1).maybeSingle(),
  ]);

  const result = await backupSalesCallsToDrive(
    calls,
    (scriptVersions || []) as ScriptVersion[],
    state?.spreadsheet_id || null
  );

  await sb.from("sales_calls_backup_state").upsert({
    id: 1,
    spreadsheet_id: result.spreadsheetId,
    updated_at: new Date().toISOString(),
  });

  return result;
}
