import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { syncMetaLeadsSheet } from "@/lib/metaLeadsSheetSync";

export const dynamic = "force-dynamic";

// Manual "sync now" for one client, mirrors what the cron does on a schedule.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const { data: sync, error } = await sb.from("lead_sheet_syncs").select("*").eq("id", params.id).single();
  if (error || !sync) return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    const result = await syncMetaLeadsSheet(sync.spreadsheet_id, sync.target_tab);
    const { data: updated } = await sb
      .from("lead_sheet_syncs")
      .update({ last_synced_at: new Date().toISOString(), last_sync_added: result.added, last_sync_error: null })
      .eq("id", params.id)
      .select()
      .single();
    return NextResponse.json({ sync: updated, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    await sb.from("lead_sheet_syncs").update({ last_synced_at: new Date().toISOString(), last_sync_error: message }).eq("id", params.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("lead_sheet_syncs")
    .update({ client_email: (body.clientEmail || "").trim() || null })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sync: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const { error } = await sb.from("lead_sheet_syncs").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
