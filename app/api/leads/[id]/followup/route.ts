import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { createSupabaseClient } from "@/lib/supabase";
import { sendPersonalizedEmail } from "@/lib/email";
import { Lead } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { callNotes, subject, bodyHtml, status } = body as {
    callNotes?: string;
    subject?: string;
    bodyHtml?: string;
    status?: string;
  };

  const sb = createSupabaseClient();
  const { data: lead, error } = await sb.from("leads").select("*").eq("lead_id", params.id).single();
  if (error || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const today = new Date().toISOString().split("T")[0];
  const updates: Record<string, unknown> = {};

  if (callNotes?.trim()) {
    const entry = `[${today} call] ${callNotes.trim()}`;
    updates.notes = lead.notes?.trim() ? `${lead.notes}\n${entry}` : entry;
  }

  let sent = false;
  let sendError: string | null = null;
  if (subject?.trim() && bodyHtml?.trim()) {
    try {
      await sendPersonalizedEmail(lead as Lead, subject.trim(), bodyHtml.trim());
      sent = true;
      updates.last_followup = today;
      updates.followup_count = (lead.followup_count || 0) + 1;
      if (lead.status === "not_contacted") {
        updates.status = "contacted";
        updates.date_contacted = today;
      }
    } catch (e) {
      sendError = e instanceof Error ? e.message : "Send failed";
    }
  }

  if (status && status !== lead.status && updates.status === undefined) {
    updates.status = status;
  }

  if (Object.keys(updates).length) {
    await sb.from("leads").update(updates).eq("lead_id", params.id);
  }

  return NextResponse.json({ sent, sendError });
}
