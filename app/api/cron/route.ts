import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { nextStepFor, STEP_NEW_STATUS } from "@/lib/leads";
import { sendOutreachEmail, sendPersonalizedEmail } from "@/lib/email";
import { generateCampaignStepEmail } from "@/lib/ai";
import { Lead } from "@/lib/types";

// Called by Vercel Cron daily at 8am NZT (20:00 UTC)
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createSupabaseClient();
  const leads = await fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").range(from, to));

  const today = new Date().toISOString().split("T")[0];
  let sent = 0, failed = 0;

  for (const lead of leads) {
    const step = nextStepFor(lead);
    if (!step) continue;
    try {
      if (lead.campaign_id) {
        const { data: priorSends } = await sb
          .from("email_sends")
          .select("subject")
          .eq("lead_id", lead.lead_id)
          .order("sent_at", { ascending: true });
        const { subject, bodyHtml } = await generateCampaignStepEmail({
          company: lead.company,
          contactName: lead.contact_name,
          trade: lead.trade,
          location: lead.location,
          notes: lead.notes,
          step,
          priorSubjects: (priorSends || []).map((s) => s.subject as string),
        });
        await sendPersonalizedEmail(lead, subject, bodyHtml, step);
      } else if (step === "checkin") {
        continue; // never happens for non-campaign leads — satisfies type checker
      } else {
        await sendOutreachEmail(lead, step);
      }
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
