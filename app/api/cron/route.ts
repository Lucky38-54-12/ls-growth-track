import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { sendNextStepFor } from "@/lib/sendPipeline";
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
  let sent = 0, failed = 0, held = 0;

  for (const lead of leads) {
    try {
      const result = await sendNextStepFor(lead, sb);
      if (result.sent) sent++;
      else if (result.held) held++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ sent, failed, held, date: today });
}
