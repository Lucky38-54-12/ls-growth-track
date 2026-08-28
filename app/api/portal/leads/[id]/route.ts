import { createSupabaseClient } from "@/lib/supabase";
import { CLIENT_COOKIE_NAME, verifyClientSessionToken } from "@/lib/leadQual/clientAuth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STAGES = ["new_inquiry", "followed_up", "callback_booked", "site_visit", "booked_job", "not_a_fit", "lost"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(CLIENT_COOKIE_NAME)?.value;
  const clientId = token ? await verifyClientSessionToken(token) : null;
  if (!clientId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const stage = body.pipeline_stage;
  if (!STAGES.includes(stage)) return NextResponse.json({ error: "invalid stage" }, { status: 400 });

  const sb = createSupabaseClient();
  const { data: lead } = await sb.from("lq_leads").select("id").eq("id", id).eq("client_id", clientId).single();
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await sb.from("lq_leads").update({ pipeline_stage: stage }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
