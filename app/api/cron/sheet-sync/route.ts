import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { syncLeadsFromSheet } from "@/lib/sheetSync";

export const dynamic = "force-dynamic";

async function runSync() {
  const sb = createSupabaseClient();
  const { data: sheets, error } = await sb.from("tracked_sheets").select("*").eq("active", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const sheet of sheets || []) {
    try {
      const result = await syncLeadsFromSheet({
        sheetId: sheet.sheet_id,
        tradeDefault: sheet.trade_default || "",
        locationDefault: sheet.location_default || "",
        personalize: sheet.personalize,
        sendFresh: sheet.send_fresh,
      });
      await sb.from("tracked_sheets").update({
        last_synced_at: new Date().toISOString(),
        last_result: `Imported ${result.imported}, sent ${result.personalizedSent + result.freshSent}`,
      }).eq("id", sheet.id);
      results.push({ sheetId: sheet.sheet_id, ...result });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sync failed";
      await sb.from("tracked_sheets").update({
        last_synced_at: new Date().toISOString(),
        last_result: `Error: ${message}`,
      }).eq("id", sheet.id);
      results.push({ sheetId: sheet.sheet_id, error: message });
    }
  }

  return NextResponse.json({ synced: results.length, results });
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSync();
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSync();
}
