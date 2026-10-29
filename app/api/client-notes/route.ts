import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Behind the dashboard session cookie. Notes tied to a client ("need to ask
// them about X") — pulled into the mid-month/end-of-month catch-up prep
// emails while unresolved (see lib/clientCatchupPrep.ts).
export async function GET() {
  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("client_catchup_notes")
    .select("id, lead_sheet_sync_id, note, resolved, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ notes: data || [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const leadSheetSyncId = (body?.leadSheetSyncId as string | undefined)?.trim();
  const note = (body?.note as string | undefined)?.trim();

  if (!leadSheetSyncId || !note) {
    return NextResponse.json({ error: "leadSheetSyncId and note are required" }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("client_catchup_notes")
    .insert({ lead_sheet_sync_id: leadSheetSyncId, note })
    .select("id, lead_sheet_sync_id, note, resolved, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ note: data });
}
