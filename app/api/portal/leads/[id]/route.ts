import { createSupabaseClient } from "@/lib/supabase";
import { CLIENT_COOKIE_NAME, verifyClientSessionToken } from "@/lib/leadQual/clientAuth";
import { enrollInNurture } from "@/lib/leadQual/nurture";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STAGES = ["new_inquiry", "followed_up", "not_ready", "booked", "not_a_fit"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(CLIENT_COOKIE_NAME)?.value;
  const clientId = token ? await verifyClientSessionToken(token) : null;
  if (!clientId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const stage = body.pipeline_stage;
  if (!STAGES.includes(stage)) return NextResponse.json({ error: "invalid stage" }, { status: 400 });

  const sb = createSupabaseClient();
  const { data: lead } = await sb
    .from("lq_leads")
    .select("id, contact_email, pipeline_stage")
    .eq("id", id)
    .eq("client_id", clientId)
    .single();
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await sb.from("lq_leads").update({ pipeline_stage: stage }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Dragging a card into "Not ready yet" is the client's manual trigger to
  // start the follow-up email sequence, same as the AI does automatically
  // for leads it scores as nurture — only fires once per lead.
  if (stage === "not_ready" && lead.pipeline_stage !== "not_ready" && lead.contact_email) {
    try {
      await enrollInNurture(lead.id, clientId, lead.contact_email);
    } catch {
      // Already enrolled or no sequence yet — not fatal to the drag action.
    }
  }

  return NextResponse.json({ ok: true });
}
