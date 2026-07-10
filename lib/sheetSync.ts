import { createSupabaseClient, fetchAllRows } from "./supabase";
import { generateLeadId } from "./leads";
import { sendPersonalizedEmail } from "./email";
import { generatePersonalizedEmail, generateCampaignStepEmail, generatePersonalizationHook } from "./ai";
import { readLeadSheet, hasCallInfo, formatCallNotes, getSheetTitle, parseCampaignFromTitle } from "./sheets";
import { Lead } from "./types";

const TERMINAL_STATUSES = new Set(["replied", "booked", "not_interested", "bounced", "sequence_complete"]);

export interface SheetSyncResult {
  imported: number;
  updated: number;
  personalizedSent: number;
  freshSent: number;
  skipped: number;
  errors: string[];
  detectedTrade?: string;
  detectedLocation?: string;
}

export async function syncLeadsFromSheet(opts: {
  sheetId: string;
  tradeDefault: string;
  locationDefault: string;
  personalize: boolean;
  sendFresh: boolean;
}): Promise<SheetSyncResult> {
  const { sheetId, tradeDefault, locationDefault, personalize, sendFresh } = opts;

  const rows = await readLeadSheet(sheetId.trim());
  if (!rows.length) {
    throw new Error("No rows with a name or email found in that sheet.");
  }

  // Guess trade/location from the sheet's title (e.g. "Wellington Builders"). The
  // scraper page sends the raw search query (e.g. "electrical companies christchurch")
  // as tradeDefault, so also parse that for a city before falling back to locationDefault.
  const title = await getSheetTitle(sheetId.trim()).catch(() => "");
  const detected = parseCampaignFromTitle(title);
  const detectedFromQuery = parseCampaignFromTitle(tradeDefault);
  const trade = detected.trade || detectedFromQuery.trade || tradeDefault;
  const location = detected.location || detectedFromQuery.location || locationDefault;

  const sb = createSupabaseClient();
  const existingLeads = await fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").range(from, to));
  const leadsByEmail = new Map<string, Lead>();
  const existingIds = new Set<string>();
  for (const lead of existingLeads) {
    if (lead.email) leadsByEmail.set(lead.email.toLowerCase(), lead);
    existingIds.add(lead.lead_id);
  }

  const today = new Date().toISOString().split("T")[0];
  let imported = 0;
  let updated = 0;
  let personalizedSent = 0;
  let freshSent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    if (!row.email || !row.email.includes("@")) { skipped++; continue; }
    const emailLower = row.email.toLowerCase();
    const called = hasCallInfo(row);
    const callNotes = formatCallNotes(row);

    let lead = leadsByEmail.get(emailLower);

    if (!lead) {
      const leadId = generateLeadId(row.company || row.email, existingIds);
      existingIds.add(leadId);
      const newLead = {
        lead_id: leadId,
        company: row.company || row.email,
        contact_name: "there",
        email: emailLower,
        trade,
        location,
        status: "not_contacted" as const,
        date_added: today,
        date_contacted: null,
        last_followup: null,
        followup_count: 0,
        notes: called ? `[Sheet] ${callNotes}` : "",
        source: "cold_call",
        website: row.website || null,
        facebook: row.facebook || null,
        personalization_hook: null,
      };
      const { data: inserted, error } = await sb.from("leads").insert(newLead).select().single();
      if (error || !inserted) {
        errors.push(`${row.company || row.email}: ${error?.message || "insert failed"}`);
        skipped++;
        continue;
      }
      lead = inserted as Lead;
      leadsByEmail.set(emailLower, lead);
      imported++;

      // Best-effort: generate a real personalization hook from the website/Facebook
      // we just captured, so the cold initial email isn't stuck with the generic
      // merge-field line. If this fails, templates.ts falls back gracefully.
      try {
        const { hook, contactName } = await generatePersonalizationHook({
          company: lead.company,
          trade: lead.trade,
          location: lead.location,
          website: lead.website,
          facebook: lead.facebook,
          notes: lead.notes,
        });
        lead.personalization_hook = hook;
        const update: Record<string, unknown> = { personalization_hook: hook };
        if (contactName && (!lead.contact_name || lead.contact_name === "there")) {
          lead.contact_name = contactName;
          update.contact_name = contactName;
        }
        await sb.from("leads").update(update).eq("lead_id", lead.lead_id);
      } catch {
        // leave personalization_hook null — template falls back to generic line
      }
    } else if (called && !lead.notes?.includes(callNotes)) {
      // Append the sheet's call info rather than overwriting notes added on the dashboard
      const entry = `[Sheet] ${callNotes}`;
      const newNotes = lead.notes?.trim() ? `${lead.notes}\n${entry}` : entry;
      await sb.from("leads").update({ notes: newNotes }).eq("lead_id", lead.lead_id);
      lead = { ...lead, notes: newNotes };
      updated++;
    }

    // Backfill trade/location on existing leads that were imported before this
    // sheet's title was being parsed correctly — never overwrite a value that's
    // already set, only fill in blanks.
    if (lead) {
      const patch: Partial<Lead> = {};
      if (!lead.trade && trade) patch.trade = trade;
      if (!lead.location && location) patch.location = location;
      if (Object.keys(patch).length) {
        await sb.from("leads").update(patch).eq("lead_id", lead.lead_id);
        lead = { ...lead, ...patch };
      }
    }

    if (TERMINAL_STATUSES.has(lead.status)) continue;

    try {
      if (called && personalize) {
        const { subject, bodyHtml } = await generatePersonalizedEmail({
          company: lead.company,
          contactName: lead.contact_name,
          trade: lead.trade,
          location: lead.location,
          callNotes,
          website: lead.website,
          personalizationHook: lead.personalization_hook,
        });
        await sendPersonalizedEmail(lead, subject, bodyHtml);
        const update: Record<string, unknown> = { last_followup: today, followup_count: (lead.followup_count || 0) + 1 };
        if (lead.status === "not_contacted") {
          update.status = "contacted";
          update.date_contacted = today;
        }
        await sb.from("leads").update(update).eq("lead_id", lead.lead_id);
        personalizedSent++;
      } else if (!called && sendFresh && lead.status === "not_contacted") {
        const { subject: freshSubject, bodyHtml: freshBody } = await generateCampaignStepEmail({
          company: lead.company,
          contactName: lead.contact_name,
          trade: lead.trade,
          location: lead.location,
          notes: lead.notes || "",
          website: lead.website,
          personalizationHook: lead.personalization_hook,
          step: "initial",
          priorSubjects: [],
        });
        await sendPersonalizedEmail(lead, freshSubject, freshBody, "initial");
        await sb.from("leads").update({ status: "contacted", date_contacted: today }).eq("lead_id", lead.lead_id);
        freshSent++;
      }
    } catch (e) {
      errors.push(`${lead.company}: ${e instanceof Error ? e.message : "send failed"}`);
    }
  }

  return {
    imported, updated, personalizedSent, freshSent, skipped, errors,
    detectedTrade: trade || undefined,
    detectedLocation: location || undefined,
  };
}

export interface TrackedSheetSyncResult {
  sheetId: string;
  error?: string;
  [key: string]: unknown;
}

// Shared by the daily cron route and the on-demand Slack "resync" action so
// the two never drift out of sync with each other again (same rationale as
// sendNextStepFor in sendPipeline.ts).
export async function syncAllTrackedSheets(
  sb: ReturnType<typeof createSupabaseClient>
): Promise<TrackedSheetSyncResult[]> {
  const { data: sheets, error } = await sb.from("tracked_sheets").select("*").eq("active", true);
  if (error) throw new Error(error.message);

  const results: TrackedSheetSyncResult[] = [];
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

  return results;
}
