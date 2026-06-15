import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { createSupabaseClient } from "@/lib/supabase";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const { data: sends, error } = await sb.from("email_sends").select("*").eq("lead_id", params.id).order("sent_at", { ascending: false });

  const { data: testInsert, error: insertError } = await sb.from("email_sends").insert({ lead_id: "TEST_PROBE", step: "test", subject: "test", body_html: "TEST_BODY_VALUE" }).select().single();
  let testRow = null;
  let testError = insertError?.message || null;
  if (testInsert) {
    testRow = testInsert;
    await sb.from("email_sends").delete().eq("id", testInsert.id);
  }

  return NextResponse.json({ sends, error: error?.message || null, testRow, testError });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const { error } = await sb.from("leads").delete().eq("lead_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
