import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// kind/clientId scope which chat history shows up where — the general
// /dashboard/brain sidebar only ever wants kind="general" (the default,
// omitted param), while the per-client Creative Brain chat wants
// kind="creative_brain" scoped to just that client, not every client's
// threads mixed together.
export async function GET(req: NextRequest) {
  const sb = createSupabaseClient();
  const kind = req.nextUrl.searchParams.get("kind") || "general";
  const clientId = req.nextUrl.searchParams.get("clientId");

  let query = sb.from("brain_conversations").select("id, title, updated_at").eq("kind", kind);
  if (kind === "creative_brain") {
    if (!clientId) return NextResponse.json({ error: "clientId is required for kind=creative_brain" }, { status: 400 });
    query = query.eq("client_id", clientId);
  }

  const { data, error } = await query.order("updated_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversations: data || [] });
}
