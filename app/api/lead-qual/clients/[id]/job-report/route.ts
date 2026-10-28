import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Backs /dashboard/lead-qual/[id]/report — a number Lucky can pull up live
// in a client meeting (fortnightly check-ins): leads in, jobs won/lost,
// total value. Reads straight off lq_leads' job_value/job_won_at/
// job_lost_reason (lib/weeklyCheckin.ts's columns) rather than keeping a
// separate running total anywhere.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseClient();

  const { data: client, error: clientError } = await sb.from("lq_clients").select("id, name").eq("id", id).single();
  if (clientError) return NextResponse.json({ error: clientError.message }, { status: 400 });

  const { data: leads, error: leadsError } = await sb
    .from("lq_leads")
    .select("id, outcome, pipeline_stage, job_value, job_won_at, job_lost_reason, created_at, contact_email, lq_conversations(extracted_fields)")
    .eq("client_id", id)
    .order("created_at", { ascending: false })
    .limit(500);
  if (leadsError) return NextResponse.json({ error: leadsError.message }, { status: 400 });

  return NextResponse.json({ client, leads: leads || [] });
}
