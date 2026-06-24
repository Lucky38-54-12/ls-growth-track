import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { createSupabaseClient } from "@/lib/supabase";
import { generatePersonalizationHook } from "@/lib/ai";
import { Lead } from "@/lib/types";

const BATCH_SIZE = 15;

// Leads imported from sheets/scraper rarely carry a real contact name, so
// they're stuck addressed as "there" forever, and most already have an old
// personalization hook generated before this could look at real website text
// or extract a name — so we can't just filter on "hook is null". Instead the
// caller drives a cursor (last lead_id seen) through the full list once,
// batch by batch. Keyset rather than numeric offset because leads that get a
// real name found drop out of the WHERE filter mid-walk, which would make a
// numeric offset skip rows.
export async function POST(req: NextRequest) {
  const sb = createSupabaseClient();
  const { afterId = "" } = await req.json().catch(() => ({ afterId: "" }));

  const { count: total } = await sb
    .from("leads")
    .select("lead_id", { count: "exact", head: true })
    .eq("contact_name", "there")
    .not("website", "is", null);

  let query = sb
    .from("leads")
    .select("*")
    .eq("contact_name", "there")
    .not("website", "is", null)
    .order("lead_id", { ascending: true })
    .limit(BATCH_SIZE);
  if (afterId) query = query.gt("lead_id", afterId);

  const { data: leads, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const batch = (leads || []) as Lead[];
  let namesFound = 0;

  for (const lead of batch) {
    try {
      const { hook, contactName } = await generatePersonalizationHook({
        company: lead.company,
        trade: lead.trade,
        location: lead.location,
        website: lead.website,
        facebook: lead.facebook,
        notes: lead.notes,
      });
      const update: Record<string, unknown> = { personalization_hook: hook };
      if (contactName) {
        update.contact_name = contactName;
        namesFound++;
      }
      await sb.from("leads").update(update).eq("lead_id", lead.lead_id);
    } catch {
      // best-effort — leave this lead as-is
    }
  }

  const lastId = batch.length ? batch[batch.length - 1].lead_id : afterId;
  return NextResponse.json({
    processed: batch.length,
    namesFound,
    afterId: lastId,
    total: total || 0,
    done: batch.length < BATCH_SIZE,
  });
}
