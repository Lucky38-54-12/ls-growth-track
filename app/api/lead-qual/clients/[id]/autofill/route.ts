import { createSupabaseClient } from "@/lib/supabase";
import { draftConfigFromFacebookPage } from "@/lib/leadQual/facebookAutofill";
import { NextRequest, NextResponse } from "next/server";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createSupabaseClient();

  const { data: client } = await sb.from("lq_clients").select("trade").eq("id", id).single();
  const { data: channel } = await sb
    .from("lq_channels")
    .select("external_page_id")
    .eq("client_id", id)
    .eq("type", "messenger")
    .maybeSingle();

  if (!channel) {
    return NextResponse.json({ error: "Connect a Facebook Page for this client first — nothing to autofill from yet." }, { status: 400 });
  }

  try {
    const draft = await draftConfigFromFacebookPage(channel.external_page_id, client?.trade || "");
    return NextResponse.json({ draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
