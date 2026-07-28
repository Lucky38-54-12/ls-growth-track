import { createSupabaseClient } from "@/lib/supabase";
import { draftConfigFromWebsite } from "@/lib/leadQual/websiteAutofill";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { url } = await request.json();

  if (!url || !url.trim()) {
    return NextResponse.json({ error: "Enter a website URL first." }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { data: client } = await sb.from("lq_clients").select("trade").eq("id", id).single();

  try {
    const draft = await draftConfigFromWebsite(url, client?.trade || "");
    return NextResponse.json({ draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
