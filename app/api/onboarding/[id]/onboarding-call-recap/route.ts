import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { sendFreeformEmail } from "@/lib/email";
import { OnboardingClient } from "@/lib/types";

export const dynamic = "force-dynamic";

// Edit the drafted recap subject/body before sending. Only valid while pending.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.subject === "string") updates.onboarding_recap_subject = body.subject;
  if (typeof body.html === "string") updates.onboarding_recap_html = body.html;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
  }

  const sb = createSupabaseClient();
  const { data, error } = await sb
    .from("onboarding_clients")
    .update(updates)
    .eq("id", params.id)
    .eq("onboarding_recap_status", "pending")
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ client: data });
}

// Send the (possibly edited) pending recap.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const { data: client, error } = await sb.from("onboarding_clients").select("*").eq("id", params.id).single();
  if (error || !client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const row = client as OnboardingClient;
  if (row.onboarding_recap_status !== "pending") {
    return NextResponse.json({ error: "This recap isn't pending." }, { status: 400 });
  }
  if (!row.email || !row.onboarding_recap_subject || !row.onboarding_recap_html) {
    return NextResponse.json({ error: "Recap is missing content." }, { status: 400 });
  }

  await sendFreeformEmail(row.email, row.onboarding_recap_subject, row.onboarding_recap_html);

  const { data: updated, error: updateError } = await sb
    .from("onboarding_clients")
    .update({ onboarding_recap_status: "sent", onboarding_recap_sent_at: new Date().toISOString() })
    .eq("id", params.id)
    .select()
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ client: updated });
}
