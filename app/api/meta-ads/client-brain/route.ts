import { createSupabaseClient } from "@/lib/supabase";
import { getClientBrain, draftClientBrainFromDocs } from "@/lib/clientBrain";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });

  const sb = createSupabaseClient();
  const clientBrain = await getClientBrain(sb, clientId);
  return NextResponse.json({ clientBrain });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });

  const sb = createSupabaseClient();
  const { data: client, error: clientError } = await sb
    .from("lq_clients")
    .select("id, name")
    .eq("id", clientId)
    .maybeSingle();
  if (clientError || !client) return NextResponse.json({ error: "Unknown client" }, { status: 400 });

  const { data: brief } = await sb.from("campaign_briefs").select("google_doc_id").eq("client_id", clientId).maybeSingle();

  try {
    const clientBrain = await draftClientBrainFromDocs(sb, clientId, client.name, brief?.google_doc_id || null);
    return NextResponse.json({ clientBrain });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
