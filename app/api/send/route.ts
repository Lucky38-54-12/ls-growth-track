import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { nextStepFor, STEP_NEW_STATUS } from "@/lib/leads";
import { sendOutreachEmail } from "@/lib/email";
import { Lead } from "@/lib/types";

export async function POST(req: Request) {
  const sb = createSupabaseClient();
  const leads = await fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").range(from, to));

  let leadIds: string[] | null = null;
  try {
    const body = await req.json();
    if (Array.isArray(body?.leadIds)) leadIds = body.leadIds;
  } catch {}

  const today = new Date().toISOString().split("T")[0];
  let sent = 0, failed = 0, skipped = 0;
  const errors: string[] = [];

  const targets = leadIds ? leads.filter((l) => leadIds!.includes(l.lead_id)) : leads;

  for (const lead of targets) {
    const step = nextStepFor(lead);
    if (!step) { skipped++; continue; }

    try {
      await sendOutreachEmail(lead, step);
      const update: Record<string, unknown> = { status: STEP_NEW_STATUS[step] };
      if (step === "initial") {
        update.date_contacted = today;
      } else {
        update.last_followup = today;
        update.followup_count = (lead.followup_count || 0) + 1;
      }
      await sb.from("leads").update(update).eq("lead_id", lead.lead_id);
      sent++;
    } catch (err: unknown) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${lead.company}: ${msg}`);
    }
  }

  return NextResponse.json({ sent, failed, skipped, errors });
}
