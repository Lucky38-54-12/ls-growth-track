import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { sendFreeformEmail } from "@/lib/email";
import { OnboardingClient } from "@/lib/types";

export const dynamic = "force-dynamic";

// Edit the drafted subject/body before sending. Only valid while still pending.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.subject === "string") updates.kickoff_email_subject = body.subject;
  if (typeof body.html === "string") updates.kickoff_email_html = body.html;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("onboarding_clients")
    .update(updates)
    .eq("id", params.id)
    .eq("kickoff_email_status", "pending")
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ client: data });
}

// Send the (possibly edited) pending kickoff email.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const { data: client, error } = await sb.from("onboarding_clients").select("*").eq("id", params.id).single();
  if (error || !client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const row = client as OnboardingClient;
  if (row.kickoff_email_status !== "pending") {
    return NextResponse.json({ error: "This kickoff email isn't pending." }, { status: 400 });
  }
  if (!row.email || !row.kickoff_email_subject || !row.kickoff_email_html) {
    return NextResponse.json({ error: "Kickoff email is missing content." }, { status: 400 });
  }

  await sendFreeformEmail(row.email, row.kickoff_email_subject, row.kickoff_email_html);

  const { data: updated, error: updateError } = await sb
    .from("onboarding_clients")
    .update({ kickoff_email_status: "sent", kickoff_email_sent_at: new Date().toISOString() })
    .eq("id", params.id)
    .select()
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ client: updated });
}
