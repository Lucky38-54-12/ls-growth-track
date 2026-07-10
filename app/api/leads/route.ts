import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { generateLeadId } from "@/lib/leads";
import { Lead } from "@/lib/types";

export async function GET() {
  const sb = createSupabaseClient();
  const data = await fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").order("date_added", { ascending: false }).range(from, to));
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const today = new Date().toISOString().split("T")[0];

  const { data: existingLead } = await sb.from("leads").select("*").eq("email", (body.email as string).toLowerCase()).maybeSingle();
  if (existingLead) {
    // source is set once at creation and never changed by a later POST —
    // otherwise cold-calling an email that was originally imported as
    // email_outreach silently reclassifies it into the Cold Call pipeline.
    return NextResponse.json({ lead: existingLead, emailError: null });
  }

  const existing = await fetchAllRows<{ lead_id: string }>((from, to) => sb.from("leads").select("lead_id").range(from, to));
  const existingIds = new Set<string>(existing.map((r) => r.lead_id));
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

  // No auto-send on creation — every outgoing email must be AI-generated and
  // gated by an active campaign (lib/sendPipeline.ts), never the old static
  // template. A newly created lead just sits until it's added to a campaign.
  const emailError: string | null = null;

  return NextResponse.json({ lead: data, emailError });
}
