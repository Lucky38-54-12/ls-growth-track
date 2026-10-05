import { createSupabaseClient, fetchAllRows } from "./supabase";
import { generateLeadId } from "./leads";
import { generatePersonalizationHook } from "./ai";
import { readLeadSheet, hasCallInfo, formatCallNotes, getSheetTitle, parseCampaignFromTitle } from "./sheets";
import { isOutreachSpendOverCap } from "./spendGuard";
import { Lead } from "./types";

// Shared budget for how many personalization-hook AI calls one sync run is
// allowed to make. Added 2026-10-04 after an uncapped version of this loop
// was identified as the main driver of a past spend spike — bulk-importing
// a big new funnel sheet used to mean one AI call (Haiku + 1 web search) per
// new row with no ceiling. Beyond the budget, new leads just get the
// generic template line instead (same fallback as any other hook failure).
export const MAX_HOOK_CALLS_PER_SYNC_RUN = 50;
export interface HookBudget { remaining: number }

export interface SheetSyncResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  detectedTrade?: string;
  detectedLocation?: string;
}

export async function syncLeadsFromSheet(opts: {
  sheetId: string;
  tradeDefault: string;
  locationDefault: string;
  // Targets one tab inside a workbook that has several (e.g. a single
  // "Cleaning" spreadsheet with one tab per city) — omit for a plain
  // single-tab sheet.
  tab?: string;
  // Shared across every sheet synced in the same run (passed down by
  // syncAllTrackedSheets/bulk-sheet-sync) so the cap is on the whole run's
  // total AI calls, not per-sheet. A direct caller that omits this (e.g. the
  // single-sheet add-a-lead-sheet route) gets its own fresh budget.
  hookBudget?: HookBudget;
}): Promise<SheetSyncResult> {
  const { sheetId, tradeDefault, locationDefault, tab } = opts;
  const hookBudget = opts.hookBudget || { remaining: MAX_HOOK_CALLS_PER_SYNC_RUN };

  const rows = await readLeadSheet(sheetId.trim(), tab);
  if (!rows.length) {
    throw new Error("No rows with a name or email found in that sheet.");
  }

  // Guess trade/location from the sheet's title (e.g. "Wellington Builders") and,
  // if given, the tab name — a tab like "Auckland" in a multi-city workbook is a
  // more reliable location signal than the workbook title, which may just name
  // the trade (e.g. "Cleaning"). The scraper page sends the raw search query
  // (e.g. "electrical companies christchurch") as tradeDefault, so also parse
  // that for a city before falling back to locationDefault.
  const title = await getSheetTitle(sheetId.trim()).catch(() => "");
  const detectedFromTab = tab ? parseCampaignFromTitle(tab) : {};
  const detected = parseCampaignFromTitle(title);
  const detectedFromQuery = parseCampaignFromTitle(tradeDefault);
  const trade = detected.trade || detectedFromQuery.trade || tradeDefault;
  const location = detectedFromTab.location || detected.location || detectedFromQuery.location || locationDefault;

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
      // cold_call is reserved for leads Lucky adds himself after actually
      // calling them (the Cold Call page, POST /api/leads with
      // source: "cold_call" set explicitly). Anything that comes in through
      // a sheet sync is email outreach, full stop, even if the sheet has old
      // call history in it — that history is real, but it isn't Lucky
      // adding this lead to his cold-call pipeline today.
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
        source: "email_outreach",
        website: row.website || null,
        facebook: row.facebook || null,
        phone: row.phone || null,
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
      // Skipped entirely while cold outreach is paused (2026-08-14) — this AI
      // call was still firing daily via daily-maintenance even with sends
      // paused, quietly burning tokens on hooks nothing would ever use.
      try {
        if (process.env.COLD_OUTREACH_PAUSED === "true") throw new Error("cold outreach paused");
        if (hookBudget.remaining <= 0) throw new Error("per-run hook budget exhausted, falling back to generic line");
        if (await isOutreachSpendOverCap()) throw new Error("daily outreach spend cap reached, falling back to generic line");
        hookBudget.remaining--;
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

    // Backfill trade/location/phone on existing leads that were imported before
    // this sheet's title was being parsed correctly (or before phone was synced
    // at all) — never overwrite a value that's already set, only fill in blanks.
    if (lead) {
      const patch: Partial<Lead> = {};
      if (!lead.trade && trade) patch.trade = trade;
      if (!lead.location && location) patch.location = location;
      if (!lead.phone && row.phone) patch.phone = row.phone;
      if (Object.keys(patch).length) {
        await sb.from("leads").update(patch).eq("lead_id", lead.lead_id);
        lead = { ...lead, ...patch };
      }
    }
  }

  return {
    imported, updated, skipped, errors,
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
  const hookBudget: HookBudget = { remaining: MAX_HOOK_CALLS_PER_SYNC_RUN };
  for (const sheet of sheets || []) {
    try {
      const result = await syncLeadsFromSheet({
        sheetId: sheet.sheet_id,
        tradeDefault: sheet.trade_default || "",
        locationDefault: sheet.location_default || "",
        tab: sheet.tab || undefined,
        hookBudget,
      });
      await sb.from("tracked_sheets").update({
        last_synced_at: new Date().toISOString(),
        last_result: `Imported ${result.imported}`,
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
