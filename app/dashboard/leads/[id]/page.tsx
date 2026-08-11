import { createSupabaseClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import CallForm from "./CallForm";
import { EmailEvent, EmailSend, Lead, TrackedSheet } from "@/lib/types";

export const revalidate = 0;

// Leads don't carry a direct sheet_id foreign key — they're matched back to
// the tracked sheet they most likely came from by trade + location, the same
// pairing tracked_sheets uses to auto-tag incoming rows (see
// app/api/leads/sheet-sync). Best-effort, not a guaranteed link.
function findSourceSheet(lead: Lead, sheets: TrackedSheet[]): TrackedSheet | null {
  const byTradeAndLocation = sheets.find(
    (s) => s.trade_default === lead.trade && s.location_default === lead.location
  );
  if (byTradeAndLocation) return byTradeAndLocation;
  return sheets.find((s) => s.trade_default === lead.trade) || null;
}

export default async function LeadCallPage({ params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const [{ data: lead }, { data: events }, { data: sends }, { data: sheets }] = await Promise.all([
    sb.from("leads").select("*").eq("lead_id", params.id).single(),
    sb.from("email_events").select("*").eq("lead_id", params.id).order("created_at", { ascending: false }),
    sb.from("email_sends").select("*").eq("lead_id", params.id).order("sent_at", { ascending: false }),
    sb.from("tracked_sheets").select("*"),
  ]);
  if (!lead) notFound();
  const sourceSheet = findSourceSheet(lead as Lead, (sheets || []) as TrackedSheet[]);
  return (
    <CallForm
      lead={lead as Lead}
      events={(events || []) as EmailEvent[]}
      sends={(sends || []) as EmailSend[]}
      sourceSheetUrl={sourceSheet ? `https://docs.google.com/spreadsheets/d/${sourceSheet.sheet_id}/edit` : null}
    />
  );
}
