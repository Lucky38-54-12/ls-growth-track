import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const sb = createSupabaseClient();
  const { data: clients, error } = await sb
    .from("lq_clients")
    .select("*, lq_calendar_connections(google_account_email, connected_at)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ clients });
}

export async function POST(request: NextRequest) {
  const sb = createSupabaseClient();
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data: client, error } = await sb
    .from("lq_clients")
    .insert({
      name,
      trade: body.trade || null,
      phone: body.phone || null,
      timezone: body.timezone || "Pacific/Auckland",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ client }, { status: 201 });
}
