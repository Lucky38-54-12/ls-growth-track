import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { sendPreparedRecap } from "@/lib/salesCallRecap";
import { SalesCall } from "@/lib/types";

export const dynamic = "force-dynamic";

// Edit the drafted subject/body before sending. Only valid while still pending.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.subject === "string") updates.recap_subject = body.subject;
  if (typeof body.html === "string") updates.recap_html = body.html;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("sales_calls")
    .update(updates)
    .eq("id", params.id)
    .eq("recap_status", "pending")
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ call: data });
}

// Send the (possibly edited) pending recap.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const { data: call, error } = await sb.from("sales_calls").select("*").eq("id", params.id).single();
  if (error || !call) return NextResponse.json({ error: "Call not found." }, { status: 404 });

  const row = call as SalesCall;
  if (row.recap_status !== "pending") {
    return NextResponse.json({ error: "This recap isn't pending." }, { status: 400 });
  }
  if (!row.recap_subject || !row.recap_html || !row.recap_recipient) {
    return NextResponse.json({ error: "Recap is missing content." }, { status: 400 });
  }

  const recipients = row.recap_recipient.split(",").map((s) => s.trim()).filter(Boolean);
  await sendPreparedRecap(row.recap_subject, row.recap_html, recipients);

  const { data: updated, error: updateError } = await sb
    .from("sales_calls")
    .update({ recap_status: "sent", recap_sent_at: new Date().toISOString() })
    .eq("id", params.id)
    .select()
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ call: updated });
}
