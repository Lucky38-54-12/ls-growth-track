import { createSupabaseClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("lq_facebook_discovered_pages")
    .select("id, page_name, suggested_client_id, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ discoveries: data });
}
