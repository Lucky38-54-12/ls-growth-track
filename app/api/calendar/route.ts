import { NextRequest, NextResponse } from "next/server";
import { listCalendarEvents, getDayRangeUTC } from "@/lib/calendar";
import { createSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to (YYYY-MM-DD) are required" }, { status: 400 });
  }

  try {
    const { startISO } = getDayRangeUTC(from);
    const { endISO } = getDayRangeUTC(to);
    const events = await listCalendarEvents(startISO, endISO);

    // Collect all attendee emails to look up in leads table
    const emails = [...new Set(events.map((e) => e.attendeeEmail).filter(Boolean))];

    if (emails.length > 0) {
      const supabase = createSupabaseClient();
      const { data: leads } = await supabase
        .from("leads")
        .select("email, company, contact_name")
        .in("email", emails);

      if (leads && leads.length > 0) {
        const leadMap = new Map<string, { company: string; contact_name: string }>();
        for (const lead of leads) {
          if (lead.email) leadMap.set(lead.email.toLowerCase(), lead);
        }
        for (const ev of events) {
          const match = leadMap.get(ev.attendeeEmail);
          if (match) {
            ev.leadCompany = match.company || "";
            ev.leadContactName = match.contact_name || "";
          }
        }
      }
    }

    return NextResponse.json({ events });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load calendar" }, { status: 500 });
  }
}
