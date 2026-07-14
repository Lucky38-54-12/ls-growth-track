import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Rolling back doesn't delete history — it creates a new version whose
// content matches the chosen past version, so version numbers stay a
// straight-line audit trail instead of branching.
export async function POST(req: NextRequest) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const versionId = body.version_id;
  if (!versionId) return NextResponse.json({ error: "Missing version_id." }, { status: 400 });

  const { data: target, error: targetError } = await sb.from("sales_script_versions").select("*").eq("id", versionId).maybeSingle();
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "Version not found." }, { status: 404 });

  const { data: latest } = await sb.from("sales_script_versions").select("version").order("version", { ascending: false }).limit(1).maybeSingle();
  const nextVersion = (latest?.version || 0) + 1;

  await sb.from("sales_script_versions").update({ is_current: false }).eq("is_current", true);

  const { data, error } = await sb.from("sales_script_versions").insert({
    version: nextVersion,
    content: target.content,
    changelog: `Rolled back to version ${target.version}.`,
    is_current: true,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ version: data });
}
