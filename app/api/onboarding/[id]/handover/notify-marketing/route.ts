import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { shareWithEmail } from "@/lib/googleDocs";
import { buildHandoverEmail } from "@/lib/handoverEmail";
import { sendFreeformEmail } from "@/lib/email";
import { OnboardingClient } from "@/lib/types";

export const dynamic = "force-dynamic";

const MARKETING_EMAIL = process.env.MARKETING_HANDOVER_EMAIL || "harris@lsgrowth.agency";

// Separate, manual step from /handover — that route just builds the client's
// Drive structure (folder, photos subfolder, doc, sheet). This is the actual
// "bring marketing in" moment: shares the client's parent folder with Harris
// (he then sees the doc, sheet, and whatever the client drops into the
// photos subfolder, all in one place) and emails him the handover. Kept as
// its own trigger since Lucky runs the campaign himself first and only hands
// off to marketing later, client by client.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const { data: client, error } = await sb.from("onboarding_clients").select("*").eq("id", params.id).single();
  if (error || !client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const row = client as OnboardingClient;
  if (!row.client_folder_url || !row.handover_doc_url || !row.leads_sheet_url || !row.client_drive_folder_url) {
    return NextResponse.json({ error: "Run the handover first — the client folder/doc/sheet aren't set up yet." }, { status: 400 });
  }

  await shareWithEmail(row.client_folder_url, MARKETING_EMAIL, "writer");

  const { subject, html } = buildHandoverEmail({
    company: row.company,
    contactName: row.name,
    handoverDocUrl: row.handover_doc_url,
    clientDriveFolderUrl: row.client_drive_folder_url,
    leadsSheetUrl: row.leads_sheet_url,
    services: row.services || undefined,
    adBudget: row.ad_budget || undefined,
  });
  await sendFreeformEmail(MARKETING_EMAIL, subject, html);

  const { data: updated, error: updateError } = await sb
    .from("onboarding_clients")
    .update({ marketing_notified_at: new Date().toISOString() })
    .eq("id", params.id)
    .select()
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ client: updated });
}
