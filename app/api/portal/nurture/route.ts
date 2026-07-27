import { createSupabaseClient } from "@/lib/supabase";
import { CLIENT_COOKIE_NAME, verifyClientSessionToken } from "@/lib/leadQual/clientAuth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(CLIENT_COOKIE_NAME)?.value;
  const clientId = token ? await verifyClientSessionToken(token) : null;
  if (!clientId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createSupabaseClient();
  const { data: enrollments, error } = await sb
    .from("lq_nurture_enrollments")
    .select(
      "id, current_step, status, next_send_at, enrolled_at, contact_email, sequence_id, lq_leads(id, contact_email, created_at, lq_conversations(extracted_fields)), lq_nurture_sequences(steps)"
    )
    .eq("client_id", clientId)
    .order("enrolled_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ enrollments: enrollments || [] });
}
