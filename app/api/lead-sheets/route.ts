import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { extractSpreadsheetId, provisionLeadsTab, syncMetaLeadsSheet } from "@/lib/metaLeadsSheetSync";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = createSupabaseClient();
  const { data, error } = await sb.from("lead_sheet_syncs").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ syncs: data });
}

// Onboards a new client's Meta Lead Ads spreadsheet in one step: creates the
// "All Leads" tab (header, checkbox/dropdown validation) if it doesn't
// already exist, runs the first sync, and saves it so the cron picks it up
// from here on — this is the "run this with everyone" self-serve path
// instead of setting each client up by hand.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const clientName = (body.clientName || "").trim();
  const clientEmail = (body.clientEmail || "").trim() || null;
  const spreadsheetId = extractSpreadsheetId(body.spreadsheetUrl || "");
  const targetTab = (body.targetTab || "All Leads").trim();

  if (!clientName) return NextResponse.json({ error: "Client name is required." }, { status: 400 });
  if (!spreadsheetId) return NextResponse.json({ error: "Couldn't find a spreadsheet ID in that URL." }, { status: 400 });

  const sb = createSupabaseClient();

  try {
    await provisionLeadsTab(spreadsheetId, targetTab);
    const result = await syncMetaLeadsSheet(spreadsheetId, targetTab);

    const { data, error } = await sb
      .from("lead_sheet_syncs")
      .insert({
        client_name: clientName,
        client_email: clientEmail,
        spreadsheet_id: spreadsheetId,
        target_tab: targetTab,
        last_synced_at: new Date().toISOString(),
        last_sync_added: result.added,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ sync: data, result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Setup failed" }, { status: 500 });
  }
}
