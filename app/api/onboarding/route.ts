import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { sendFreeformEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("onboarding_clients")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const { name, company, email, phone, subject, bodyHtml, decisionStatus } = body;

  const { data, error } = await sb
    .from("onboarding_clients")
    .insert({
      name, company, email: email || null, phone: phone || null,
      decision_status: decisionStatus === "thinking" ? "thinking" : "ready",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = false;
  let sendError = "";
  if (email && subject && bodyHtml) {
    try {
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:560px;">${bodyHtml}<p>Cheers,<br>Lucky<br>LS Growth</p></div>`;
      await sendFreeformEmail(email, subject, html);
      sent = true;
    } catch (e) {
      sendError = e instanceof Error ? e.message : "Send failed";
    }
  }

  return NextResponse.json({ ...data, sent, sendError });
}
