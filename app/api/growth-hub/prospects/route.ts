import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = createSupabaseClient();
  const { data, error } = await sb.from("prospects").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Accepts either a single prospect object or an array, so a bulk-paste
// import (rows copied straight out of Apollo/a spreadsheet) can insert in
// one request instead of one round trip per row.
export async function POST(req: NextRequest) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const rows = Array.isArray(body) ? body : [body];

  const inserts = rows.map(row => ({
    name: String(row.name || "").trim(),
    company: row.company || null,
    industry: row.industry || null,
    linkedin_url: row.linkedin_url || null,
    connected: Boolean(row.connected),
  }));

  if (inserts.some(r => !r.name)) {
    return NextResponse.json({ error: "Every prospect needs a name" }, { status: 400 });
  }

  const { data, error } = await sb.from("prospects").insert(inserts).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
