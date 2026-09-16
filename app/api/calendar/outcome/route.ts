import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const VALID = new Set(["showed", "no_show", "rescheduled"]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const eventId = body?.eventId;
  const showStatus = body?.showStatus;
  if (!eventId || !VALID.has(showStatus)) {
    return NextResponse.json({ error: "eventId and a valid showStatus are required" }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { error } = await sb
    .from("meeting_outcomes")
    .upsert({ event_id: eventId, show_status: showStatus, marked_at: new Date().toISOString() }, { onConflict: "event_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
