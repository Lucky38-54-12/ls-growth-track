import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = createSupabaseClient();
  const { data, error } = await sb.from("content_ideas").select("*").order("post_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const title = String(body.title || "").trim();

  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const { data, error } = await sb.from("content_ideas").insert({
    title,
    notes: body.notes || null,
    post_date: body.post_date || null,
    status: body.status || "idea",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
