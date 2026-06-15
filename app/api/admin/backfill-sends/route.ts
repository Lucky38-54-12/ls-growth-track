import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

const TOKEN = "f3e73d8b77f16edda7063aa422d3cebff0ea10cde2c03c2f";

const ROWS = [
  { lead_id: "first-class-cleaners-2", step: "custom", subject: "Meeting follow-up - First Class Cleaners", sent_at: "2026-06-15T00:00:00Z" },
  { lead_id: "first-class-cleaners-3", step: "custom", subject: "Meeting follow-up - First Class Cleaners", sent_at: "2026-06-15T00:00:00Z" },
  { lead_id: "first-class-cleaners-4", step: "custom", subject: "Meeting follow-up - First Class Cleaners", sent_at: "2026-06-15T00:00:00Z" },
  { lead_id: "first-class-cleaners-5", step: "custom", subject: "Meeting follow-up - First Class Cleaners", sent_at: "2026-06-15T00:00:00Z" },
  { lead_id: "fresh-sweep-2", step: "custom", subject: "Meeting follow-up - Fresh Sweep", sent_at: "2026-06-15T00:00:00Z" },
];

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("token") !== TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sb = createSupabaseClient();
  const { data, error } = await sb.from("email_sends").insert(ROWS).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inserted: data.length });
}
