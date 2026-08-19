import { createSupabaseClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Only the client's own contact fields (not business_info/services/etc,
// which live in lq_client_configs and are edited via the config route).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, string | null> = {};
  if (typeof body.email === "string") updates.email = body.email.trim() || null;
  if (typeof body.phone === "string") updates.phone = body.phone.trim() || null;
  if (typeof body.meta_ad_account_id === "string") updates.meta_ad_account_id = body.meta_ad_account_id.trim() || null;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const sb = createSupabaseClient();
  const { data: client, error } = await sb.from("lq_clients").update(updates).eq("id", id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ client });
}
