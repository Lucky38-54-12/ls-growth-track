import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { generateLeadId, nextStepFor, STEP_NEW_STATUS } from "@/lib/leads";
import { sendOutreachEmail } from "@/lib/email";
import { generatePersonalizationHook } from "@/lib/ai";
import { Lead } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { rows, tradeDefault, locationDefault, sendNow } = body as {
    rows: string[];
    tradeDefault: string;
    locationDefault: string;
    sendNow: boolean;
  };

  const sb = createSupabaseClient();
  const existing = await fetchAllRows<{ lead_id: string; email: string }>((from, to) => sb.from("leads").select("lead_id, email").range(from, to));
  const existingIds = new Set<string>(existing.map((r) => r.lead_id));
  const existingEmails = new Set<string>(existing.map((r) => r.email.toLowerCase()));

  const today = new Date().toISOString().split("T")[0];
  const newLeads: object[] = [];
  let skipped = 0;
  const parseErrors: string[] = [];

  for (const line of rows) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("business name") || lower.startsWith("company") || lower.startsWith("lead_id")) continue;

    // Parse CSV line (simple split — quoted fields handled by frontend)
    const parts = trimmed.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 2) { skipped++; continue; }

    // Auto-detect scraper format: 2nd column is phone number
    const isScraperFmt = parts.length >= 3 && /^[\d\s+\-().]{6,}$/.test(parts[1]);
    let company: string, email: string, contactName: string, trade: string, location: string;
    let website = "", facebook = "";

    if (isScraperFmt) {
      // Scraper CSV columns: Business Name, Number, Email, Website, Facebook Page, ...
      [company, , email, website = "", facebook = ""] = parts;
      contactName = "";
      trade = tradeDefault;
      location = locationDefault;
    } else {
      [company, email, contactName = "", trade = tradeDefault, location = locationDefault] = parts;
    }

    if (!email || !email.includes("@")) {
      if (company) parseErrors.push(`No email for: ${company.slice(0, 40)}`);
      skipped++;
      continue;
    }

    const emailLower = email.toLowerCase();
    if (existingEmails.has(emailLower)) { skipped++; continue; }

    const leadId = generateLeadId(company, existingIds);
    existingIds.add(leadId);
    existingEmails.add(emailLower);

    newLeads.push({
      lead_id: leadId,
      company,
      contact_name: contactName || "there",
      email: emailLower,
      trade,
      location,
      status: "not_contacted",
      date_added: today,
      date_contacted: null,
      last_followup: null,
      followup_count: 0,
      notes: "",
      source: "email_outreach",
      website: website || null,
      facebook: facebook || null,
      personalization_hook: null,
    });
  }

  if (!newLeads.length) {
    return NextResponse.json({ imported: 0, sent: 0, skipped, errors: parseErrors });
  }

  const { data: inserted, error } = await sb.from("leads").insert(newLeads).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const leads = inserted as Lead[];

  // Generate a research-based personalization hook for each new lead so the
  // outreach email references something real instead of a generic merge field.
  // Best-effort: if the AI call fails for a lead, it just falls back to the
  // generic line in the template (handled in lib/templates.ts).
  for (const lead of leads) {
    try {
      const hook = await generatePersonalizationHook({
        company: lead.company,
        trade: lead.trade,
        location: lead.location,
        website: lead.website,
        facebook: lead.facebook,
        notes: lead.notes,
      });
      lead.personalization_hook = hook;
      await sb.from("leads").update({ personalization_hook: hook }).eq("lead_id", lead.lead_id);
    } catch {
      // leave personalization_hook null — template falls back to generic line
    }
  }

  let sent = 0;
  if (sendNow) {
    for (const lead of leads) {
      const step = nextStepFor(lead);
      if (!step) continue;
      try {
        await sendOutreachEmail(lead, step);
        const update: Record<string, unknown> = { status: STEP_NEW_STATUS[step] };
        if (step === "initial") update.date_contacted = today;
        else { update.last_followup = today; update.followup_count = 1; }
        await sb.from("leads").update(update).eq("lead_id", lead.lead_id);
        sent++;
      } catch {}
    }
  }

  // Email-outreach leads are assumed to already have an email out (sent here,
  // or sent through whatever produced this CSV) — they belong on the
  // "Contacted" stage of the pipeline, never "New Lead".
  const stillUncontacted = leads.filter((l) => l.status === "not_contacted");
  if (stillUncontacted.length) {
    await sb.from("leads").update({ status: "contacted", date_contacted: today }).in(
      "lead_id",
      stillUncontacted.map((l) => l.lead_id)
    );
  }

  return NextResponse.json({ imported: newLeads.length, sent, skipped, errors: parseErrors });
}
