import { NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { ScriptVersion, ScriptProposal } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = createSupabaseClient();

  const [{ data: versions, error: versionsError }, { data: proposals, error: proposalsError }] = await Promise.all([
    sb.from("sales_script_versions").select("*").order("version", { ascending: false }),
    sb.from("sales_script_proposals").select("*").eq("status", "pending").order("created_at", { ascending: false }),
  ]);

  if (versionsError) return NextResponse.json({ error: versionsError.message }, { status: 500 });
  if (proposalsError) return NextResponse.json({ error: proposalsError.message }, { status: 500 });

  const all = (versions || []) as ScriptVersion[];
  const current = all.find((v) => v.is_current) || all[0] || null;

  return NextResponse.json({ current, versions: all, pendingProposals: (proposals || []) as ScriptProposal[] });
}
