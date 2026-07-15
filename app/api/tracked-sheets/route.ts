import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { syncLeadsFromSheet } from "@/lib/sheetSync";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = createSupabaseClient();
  const { data, error } = await sb.from("tracked_sheets").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sheets: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sheetId, tradeDefault, locationDefault } = body as {
    sheetId: string;
    tradeDefault?: string;
    locationDefault?: string;
  };

  if (!sheetId?.trim()) {
    return NextResponse.json({ error: "Sheet ID is required" }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { data: row, error } = await sb
    .from("tracked_sheets")
    .insert({
      sheet_id: sheetId.trim(),
      trade_default: tradeDefault || null,
      location_default: locationDefault || null,
    })
    .select()
    .single();

  if (error) {
    const message = error.code === "23505" ? "That sheet is already being auto-synced." : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Best-effort first sync right away, so new leads start flowing in
  // immediately instead of waiting for the next daily cron run.
  let firstSync;
  try {
    firstSync = await syncLeadsFromSheet({
      sheetId: row.sheet_id,
      tradeDefault: row.trade_default || "",
      locationDefault: row.location_default || "",
    });
    await sb.from("tracked_sheets").update({
      last_synced_at: new Date().toISOString(),
      last_result: `Imported ${firstSync.imported}`,
    }).eq("id", row.id);
  } catch (e) {
    firstSync = { error: e instanceof Error ? e.message : "First sync failed" };
  }

  return NextResponse.json({ sheet: row, firstSync });
}
