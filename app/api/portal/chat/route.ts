import { createSupabaseClient } from "@/lib/supabase";
import { CLIENT_COOKIE_NAME, verifyClientSessionToken } from "@/lib/leadQual/clientAuth";
import { runPortalChatTurn, type PortalChatTurn } from "@/lib/leadQual/portalChat";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_HISTORY_TURNS = 20;

export async function POST(request: NextRequest) {
  const token = request.cookies.get(CLIENT_COOKIE_NAME)?.value;
  const clientId = token ? await verifyClientSessionToken(token) : null;
  if (!clientId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const messages: PortalChatTurn[] = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
    return NextResponse.json({ error: "messages must end with a user turn" }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { data: client } = await sb.from("lq_clients").select("id, name").eq("id", clientId).single();
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: leads, error } = await sb
    .from("lq_leads")
    .select("outcome, pipeline_stage, booking_status, scheduled_at, created_at, contact_email, lq_conversations(extracted_fields)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const leadSummaries = (leads || []).map((lead: any) => ({
    outcome: lead.outcome,
    pipeline_stage: lead.pipeline_stage,
    booking_status: lead.booking_status,
    scheduled_at: lead.scheduled_at,
    created_at: lead.created_at,
    contact_email: lead.contact_email,
    extracted_fields: lead.lq_conversations?.extracted_fields || {},
  }));

  try {
    const reply = await runPortalChatTurn(client.name, leadSummaries, messages.slice(-MAX_HISTORY_TURNS));
    return NextResponse.json({ reply });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Chat failed" }, { status: 500 });
  }
}
