import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/resend-sends — recent emails actually sent via Resend (email_sends
// table), joined with the lead's company/email so the sidebar can show who
// each one went to. This is separate from the Gmail inbox (lib/gmail.ts) —
// Resend sends aren't in any inbox, they only exist as this DB row.
export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 100, 500);
  const sb = createSupabaseClient();

  const { data: sends, error } = await sb
    .from("email_sends")
    .select("id, lead_id, step, subject, body_html, sent_at")
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const leadIds = Array.from(new Set((sends || []).map(s => s.lead_id)));
  let leadsById = new Map<string, { company: string; email: string }>();
  if (leadIds.length > 0) {
    const { data: leads } = await sb.from("leads").select("lead_id, company, email").in("lead_id", leadIds);
    leadsById = new Map((leads || []).map(l => [l.lead_id, { company: l.company, email: l.email }]));
  }

  const messages = (sends || []).map(s => ({
    id: s.id,
    leadId: s.lead_id,
    step: s.step,
    subject: s.subject,
    bodyHtml: s.body_html,
    sentAt: s.sent_at,
    company: leadsById.get(s.lead_id)?.company || "",
    email: leadsById.get(s.lead_id)?.email || "",
  }));

  return NextResponse.json({ messages });
}
