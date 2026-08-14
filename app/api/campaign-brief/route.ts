import { createSupabaseClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Lists every onboarded client alongside their brief (if one exists yet) —
// the client-picker list on /dashboard/campaign-setup.
export async function GET() {
  const sb = createSupabaseClient();

  const { data: clients, error: clientsError } = await sb
    .from("lq_clients")
    .select("id, name, trade, status")
    .order("name", { ascending: true });
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 400 });

  const { data: briefs, error: briefsError } = await sb
    .from("campaign_briefs")
    .select("id, client_id, status, updated_at");
  if (briefsError) return NextResponse.json({ error: briefsError.message }, { status: 400 });

  const briefByClient = new Map((briefs || []).map((b) => [b.client_id, b]));
  const result = (clients || []).map((c) => ({ ...c, brief: briefByClient.get(c.id) || null }));

  return NextResponse.json({ clients: result });
}
