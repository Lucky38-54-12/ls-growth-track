import { NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { stillHeld } from "@/lib/leads";
import { EmailCheck, EmailSend } from "@/lib/types";

export const dynamic = "force-dynamic";

// Held cold-call-followup emails live here instead of the global Today page
// "Needs Your Attention" panel — this is where they're generated and
// reviewed (the Cold Call page), so review happens in the same place as the
// work instead of a separate list Lucky has to cross-reference back to here.
export async function GET() {
  const sb = createSupabaseClient();
  const [{ data: checks }, { data: sends }] = await Promise.all([
    sb.from("email_checks").select("*").eq("step", "cold_call_followup").eq("verdict", "rejected").eq("sent", false).order("created_at", { ascending: false }).limit(20),
    sb.from("email_sends").select("lead_id, step"),
  ]);

  const held = stillHeld((checks || []) as EmailCheck[], (sends || []) as EmailSend[]);
  return NextResponse.json(held);
}
