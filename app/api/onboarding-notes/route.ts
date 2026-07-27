import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = createSupabaseClient();
  const { data, error } = await sb.from("onboarding_notes").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const note = body.note;

  if (!note || !String(note).trim()) {
    return NextResponse.json({ error: "Write something first." }, { status: 400 });
  }

  const { data, error } = await sb.from("onboarding_notes").insert({ note: String(note).trim() }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
