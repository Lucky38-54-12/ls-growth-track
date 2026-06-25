import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { sendNextStepFor } from "@/lib/sendPipeline";
import { Lead } from "@/lib/types";

export async function POST(req: Request) {
  const sb = createSupabaseClient();
  const leads = await fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").range(from, to));

  let leadIds: string[] | null = null;
  try {
    const body = await req.json();
    if (Array.isArray(body?.leadIds)) leadIds = body.leadIds;
  } catch {}

  let sent = 0, failed = 0, skipped = 0;
  const errors: string[] = [];

  const targets = leadIds ? leads.filter((l) => leadIds!.includes(l.lead_id)) : leads;

  for (const lead of targets) {
    try {
      const result = await sendNextStepFor(lead, sb);
      if (result.sent) sent++;
      else skipped++;
    } catch (err: unknown) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${lead.company}: ${msg}`);
    }
  }

  return NextResponse.json({ sent, failed, skipped, errors });
}
