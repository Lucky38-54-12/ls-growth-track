import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { nextStepFor, STEP_NEW_STATUS } from "@/lib/leads";
import { sendOutreachEmail } from "@/lib/email";
import { Lead } from "@/lib/types";

// Called by Vercel Cron daily at 8am NZT (20:00 UTC)
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createSupabaseClient();
  const { data: leads, error } = await sb.from("leads").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = new Date().toISOString().split("T")[0];
  let sent = 0, failed = 0;

  for (const lead of leads as Lead[]) {
    const step = nextStepFor(lead);
    if (!step) continue;
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
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ sent, failed, date: today });
}
