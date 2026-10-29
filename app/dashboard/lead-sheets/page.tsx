import Topbar from "@/components/Topbar";
import { createSupabaseClient } from "@/lib/supabase";
import LeadSheetsClient from "./LeadSheetsClient";

export const revalidate = 0;

export interface LeadSheetSync {
  id: string;
  client_name: string;
  client_email: string | null;
  spreadsheet_id: string;
  target_tab: string;
  last_synced_at: string | null;
  last_sync_added: number | null;
  last_sync_error: string | null;
  created_at: string;
}

export interface ClientCatchupNote {
  id: string;
  lead_sheet_sync_id: string;
  note: string;
  resolved: boolean;
  created_at: string;
}

export default async function LeadSheetsPage() {
  const sb = createSupabaseClient();
  const [{ data: syncs }, { data: notes }] = await Promise.all([
    sb.from("lead_sheet_syncs").select("*").order("created_at", { ascending: false }),
    sb.from("client_catchup_notes").select("*").order("created_at", { ascending: false }),
  ]);

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh" }}>
      <Topbar title="Client Lead Sheets" subtitle="Meta lead ads → one call-tracking tab per client, synced automatically" />
      <div style={{ padding: "24px 28px 60px", maxWidth: 900 }}>
        <LeadSheetsClient initialSyncs={(syncs as LeadSheetSync[]) || []} initialNotes={(notes as ClientCatchupNote[]) || []} />
      </div>
    </div>
  );
}
