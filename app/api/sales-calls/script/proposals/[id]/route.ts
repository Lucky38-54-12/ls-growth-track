import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

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

  // Approved: create a new current version with the proposed content.
  if (!proposal.new_content?.trim()) {
    return NextResponse.json({ error: "This proposal has no content to apply." }, { status: 400 });
  }

  const { data: latest } = await sb.from("sales_script_versions").select("version").order("version", { ascending: false }).limit(1).maybeSingle();
  const nextVersion = (latest?.version || 0) + 1;

  await sb.from("sales_script_versions").update({ is_current: false }).eq("is_current", true);

  const { data: newVersion, error: versionError } = await sb.from("sales_script_versions").insert({
    version: nextVersion,
    content: proposal.new_content,
    changelog: proposal.summary || "Approved script update.",
    is_current: true,
  }).select().single();
  if (versionError) return NextResponse.json({ error: versionError.message }, { status: 500 });

  const { data: updatedProposal, error: updateError } = await sb.from("sales_script_proposals")
    .update({ status: "approved", decided_at: new Date().toISOString() })
    .eq("id", params.id).select().single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // If this proposal was raised to fix a tracked pattern, mark the fix as
  // now live so the next standing review can tell whether it actually stuck.
  await sb.from("sales_pattern_tracker")
    .update({ fix_applied_at: new Date().toISOString(), fix_landing_status: "untested" })
    .eq("fix_proposal_id", params.id);

  return NextResponse.json({ proposal: updatedProposal, version: newVersion });
}
