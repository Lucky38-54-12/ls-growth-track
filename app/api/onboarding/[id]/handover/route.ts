import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { generateHandoverDoc } from "@/lib/handoverDoc";
import { createClientFolder, extractDriveFileId } from "@/lib/googleDocs";
import { createClientLeadsSheet, CLIENT_LEADS_TARGET_TAB } from "@/lib/clientLeadsSheet";
import { OnboardingClient, SalesCall } from "@/lib/types";

export const dynamic = "force-dynamic";

// Fired by the "Client signed & closed" button on the onboarding detail
// page. Builds one Drive folder per client (client_folder_url) containing a
// Photos & Videos subfolder, the marketing handover doc, and the leads sheet
// — but does NOT share any of it or notify marketing. Lucky runs the
// campaign himself first; see /handover/notify-marketing for the separate,
// manual "hand off to marketing" step that shares the folder with Harris and
// sends the notification once he's ready to bring marketing in. Each step
// here is best-effort so a partial failure (e.g. Drive hiccup) doesn't lose
// the ones that worked — same pattern as lib/logSalesCall.ts.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const { data: client, error } = await sb.from("onboarding_clients").select("*").eq("id", params.id).single();
  if (error || !client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const row = client as OnboardingClient;

  const { data: call } = row.sales_call_id
    ? await sb.from("sales_calls").select("*").eq("id", row.sales_call_id).single()
    : { data: null };
  const salesCall = call as SalesCall | null;

  const errors: string[] = [];

  // Parent client folder — reused across re-runs instead of creating a new
  // one each time, so nothing gets orphaned/duplicated in Drive.
  let clientFolderUrl: string | null = row.client_folder_url || null;
  let clientFolderId: string | null = clientFolderUrl ? extractDriveFileId(clientFolderUrl) : null;
  if (!clientFolderId) {
    try {
      const folder = await createClientFolder(row.company);
      clientFolderId = folder.id;
      clientFolderUrl = folder.url;
    } catch (e) {
      console.error("handover: client folder creation failed", params.id, e);
      errors.push("client folder");
    }
  }

  let handoverDocUrl: string | null = null;
  try {
    handoverDocUrl = await generateHandoverDoc(
      {
        company: row.company,
        contactName: row.name,
        services: row.services || undefined,
        adBudget: row.ad_budget || undefined,
        creativesNeeded: row.creatives_needed || undefined,
        dealNotes: row.notes || salesCall?.deal_terms || undefined,
        callSummary: salesCall?.raw_summary || undefined,
      },
      clientFolderId || undefined
    );
  } catch (e) {
    console.error("handover: doc generation failed", params.id, e);
    errors.push("handover doc");
  }

  // The client-facing subfolder — not shared with the client yet (manual
  // step for now), lives inside the parent folder so Harris sees whatever
  // gets dropped in it without anything needing to be copied across.
  let clientDriveFolderUrl: string | null = null;
  if (clientFolderId) {
    try {
      const photosFolder = await createClientFolder(`${row.company} — Photos & Videos`, clientFolderId);
      clientDriveFolderUrl = photosFolder.url;
    } catch (e) {
      console.error("handover: photos subfolder creation failed", params.id, e);
      errors.push("photos & videos subfolder");
    }
  }

  // Reused across re-runs like the client folder above — otherwise a
  // re-run would create a second spreadsheet and a duplicate
  // lead_sheet_syncs row (double-syncing, double-emailing the client).
  let leadsSheetUrl: string | null = row.leads_sheet_url || null;
  if (!leadsSheetUrl) {
    try {
      const sheet = await createClientLeadsSheet(row.company, clientFolderId || undefined);
      leadsSheetUrl = sheet.url;

      // Wires this client into the same 15-min sync-lead-sheets cron every
      // other client's leads sheet runs on — syncMetaLeadsSheet() picks up
      // whatever raw tab(s) Lucky's Meta lead-ad integration writes into
      // once he connects it on Meta's side, and notifyBookedLeads() emails
      // row.email whenever a Booked Date/Time gets filled in.
      const { error: syncInsertError } = await sb.from("lead_sheet_syncs").insert({
        client_name: row.company,
        spreadsheet_id: sheet.spreadsheetId,
        target_tab: CLIENT_LEADS_TARGET_TAB,
        client_email: row.email,
        onboarding_client_id: params.id,
      });
      if (syncInsertError) {
        console.error("handover: lead_sheet_syncs insert failed", params.id, syncInsertError);
        errors.push("leads sheet sync registration");
      }
    } catch (e) {
      console.error("handover: leads sheet creation failed", params.id, e);
      errors.push("leads sheet");
    }
  }

  // "failed" only when nothing at all came out of this — any partial
  // success still counts as sent, with `errors` telling the UI what to retry.
  const handoverStatus = handoverDocUrl || clientFolderUrl || leadsSheetUrl ? "sent" : "failed";

  const { data: updated, error: updateError } = await sb
    .from("onboarding_clients")
    .update({
      handover_status: handoverStatus,
      handover_doc_url: handoverDocUrl,
      client_folder_url: clientFolderUrl,
      client_drive_folder_url: clientDriveFolderUrl,
      leads_sheet_url: leadsSheetUrl,
      handover_sent_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select()
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ client: updated, errors: errors.length ? errors : undefined });
}
