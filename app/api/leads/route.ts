import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { createSupabaseClient } from "@/lib/supabase";
import { generateLeadId } from "@/lib/leads";
import { sendOutreachEmail } from "@/lib/email";
import { Lead } from "@/lib/types";

export async function GET() {
  const sb = createSupabaseClient();
  const { data, error } = await sb.from("leads").select("*").order("date_added", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const today = new Date().toISOString().split("T")[0];

  const { data: existingLead } = await sb.from("leads").select("*").eq("email", (body.email as string).toLowerCase()).maybeSingle();
  if (existingLead) {
    if (body.source && body.source !== existingLead.source) {
      const { data: updated } = await sb.from("leads").update({ source: body.source }).eq("lead_id", existingLead.lead_id).select().single();
      return NextResponse.json({ lead: updated || existingLead, emailError: null });
    }
    return NextResponse.json({ lead: existingLead, emailError: null });
  }

  const { data: existing } = await sb.from("leads").select("lead_id");
  const existingIds = new Set<string>((existing || []).map((r: { lead_id: string }) => r.lead_id));
  const leadId = generateLeadId(body.company, existingIds);

  const lead = {
    lead_id: leadId,
    company: body.company,
    contact_name: body.contact_name || "there",
    email: (body.email as string).toLowerCase(),
    trade: body.trade || "",
    location: body.location || "",
    status: body.source === "cold_call" ? "called" : "not_contacted",
    date_added: today,
    date_contacted: null,
    last_followup: null,
    followup_count: 0,
    notes: body.notes || "",
    source: body.source || "email_outreach",
  };

  const { data, error } = await sb.from("leads").insert(lead).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.sendInitialEmail === false) {
    return NextResponse.json({ lead: data, emailError: null });
  }

  let emailError: string | null = null;
  try {
    await sendOutreachEmail(data as Lead, "initial");
    await sb.from("leads").update({ status: "contacted", date_contacted: today }).eq("lead_id", leadId);
    data.status = "contacted";
    data.date_contacted = today;
  } catch (err: unknown) {
    emailError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({ lead: data, emailError });
}
