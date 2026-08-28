import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { approveScriptProposal } from "@/lib/salesCallsPatterns";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const decision = body.decision;

  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json({ error: "decision must be 'approved' or 'rejected'." }, { status: 400 });
  }

  const { data: proposal, error: proposalError } = await sb.from("sales_script_proposals").select("*").eq("id", params.id).maybeSingle();
  if (proposalError) return NextResponse.json({ error: proposalError.message }, { status: 500 });
  if (!proposal) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  if (proposal.status !== "pending") return NextResponse.json({ error: "This proposal has already been decided." }, { status: 400 });

  if (decision === "rejected") {
    const { data, error } = await sb.from("sales_script_proposals")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .eq("id", params.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ proposal: data });
  }

  const result = await approveScriptProposal(sb, params.id);
  if (!result) return NextResponse.json({ error: "This proposal has no content to apply." }, { status: 400 });

  return NextResponse.json(result);
}
