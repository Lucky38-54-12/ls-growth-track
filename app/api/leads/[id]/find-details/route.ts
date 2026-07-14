import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { findLeadContactDetails } from "@/lib/ai";
import { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const { data: lead, error } = await sb.from("leads").select("*").eq("lead_id", params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const found = await findLeadContactDetails({
    company: lead.company,
    trade: lead.trade,
    location: lead.location,
    website: lead.website,
    facebook: lead.facebook,
    notes: lead.notes,
  });

  // Only fill in what's actually blank — never overwrite a real value
  // already on file with something a search turned up.
  const l = lead as Lead;
  const updates: Record<string, unknown> = {};
  if (!l.phone && found.phone) updates.phone = found.phone;
  if (!l.email && found.email) updates.email = found.email;
  if (!l.website && found.website) updates.website = found.website;
  if (!l.facebook && found.facebook) updates.facebook = found.facebook;
  if ((!l.contact_name || l.contact_name === "there") && found.contactName) updates.contact_name = found.contactName;

  let updated = lead;
  if (Object.keys(updates).length) {
    const { data, error: updateError } = await sb.from("leads").update(updates).eq("lead_id", params.id).select().single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    updated = data;
  }

  return NextResponse.json({ lead: updated, found: Object.keys(updates) });
}
