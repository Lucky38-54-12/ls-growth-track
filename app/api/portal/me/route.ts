import { createSupabaseClient } from "@/lib/supabase";
import { CLIENT_COOKIE_NAME, verifyClientSessionToken } from "@/lib/leadQual/clientAuth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Lightweight identity check for the portal shell (sidebar/header name) —
// separate from /api/portal/leads so pages that don't need the leads list
// (or want to render the shell before the leads fetch resolves) aren't
// coupled to it.
export async function GET(request: NextRequest) {
  const token = request.cookies.get(CLIENT_COOKIE_NAME)?.value;
  const clientId = token ? await verifyClientSessionToken(token) : null;
  if (!clientId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createSupabaseClient();
  const { data: client } = await sb.from("lq_clients").select("id, name, logo_url").eq("id", clientId).single();
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ client });
}
