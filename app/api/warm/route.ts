import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { createSupabaseClient } from "@/lib/supabase";
import { Lead, EmailEvent, EngagementSummary } from "@/lib/types";

const WARM_STATUSES = new Set(["replied", "booked"]);

export async function GET() {
  const sb = createSupabaseClient();

  const [{ data: leads }, { data: events }] = await Promise.all([
    sb.from("leads").select("*").order("date_added", { ascending: false }),
    sb.from("email_events").select("*"),
  ]);

  const engagement: Record<string, EngagementSummary> = {};
  for (const ev of (events || []) as EmailEvent[]) {
    if (!engagement[ev.lead_id]) engagement[ev.lead_id] = { opens: 0, clicks: 0, last_event_at: null };
    if (ev.event_type === "open") engagement[ev.lead_id].opens++;
    if (ev.event_type === "click") engagement[ev.lead_id].clicks++;
    if (!engagement[ev.lead_id].last_event_at || ev.created_at > engagement[ev.lead_id].last_event_at!) {
      engagement[ev.lead_id].last_event_at = ev.created_at;
    }
  }

  const warm = (leads as Lead[]).filter((l) => {
    const ev = engagement[l.lead_id];
    return WARM_STATUSES.has(l.status) || (ev && (ev.opens > 0 || ev.clicks > 0));
  });

  return NextResponse.json({ leads: warm, engagement });
}
