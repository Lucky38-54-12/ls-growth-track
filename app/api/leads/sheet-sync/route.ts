import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { createSupabaseClient } from "@/lib/supabase";
import { generateLeadId } from "@/lib/leads";
import { sendOutreachEmail, sendPersonalizedEmail } from "@/lib/email";
import { generatePersonalizedEmail } from "@/lib/ai";
import { readLeadSheet, hasCallInfo, formatCallNotes } from "@/lib/sheets";
import { Lead } from "@/lib/types";

const TERMINAL_STATUSES = new Set(["replied", "booked", "not_interested", "bounced", "sequence_complete"]);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sheetId, tradeDefault, locationDefault, personalize, sendFresh } = body as {
    sheetId: string;
    tradeDefault: string;
    locationDefault: string;
    personalize: boolean;
    sendFresh: boolean;
  };

  if (!sheetId?.trim()) {
    return NextResponse.json({ error: "Sheet ID is required" }, { status: 400 });
  }

  let rows;
  try {
    rows = await readLeadSheet(sheetId.trim());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read sheet" }, { status: 400 });
  }

  if (!rows.length) {
    return NextResponse.json({ error: "No rows with a name or email found in that sheet." }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { data: existingLeads } = await sb.from("leads").select("*");
  const leadsByEmail = new Map<string, Lead>();
  const existingIds = new Set<string>();
  for (const lead of (existingLeads || []) as Lead[]) {
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
        trade: tradeDefault,
        location: locationDefault,
        status: "not_contacted" as const,
        date_added: today,
        date_contacted: null,
        last_followup: null,
        followup_count: 0,
        notes: callNotes,
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
    } else if (called && callNotes !== lead.notes) {
      await sb.from("leads").update({ notes: callNotes }).eq("lead_id", lead.lead_id);
      lead = { ...lead, notes: callNotes };
      updated++;
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
        await sendOutreachEmail(lead, "initial");
        await sb.from("leads").update({ status: "contacted", date_contacted: today }).eq("lead_id", lead.lead_id);
        freshSent++;
      }
    } catch (e) {
      errors.push(`${lead.company}: ${e instanceof Error ? e.message : "send failed"}`);
    }
  }

  return NextResponse.json({ imported, updated, personalizedSent, freshSent, skipped, errors });
}
