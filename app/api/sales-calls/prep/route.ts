import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { generateCallPrep } from "@/lib/salesCallsAi";
import { recentWorkOnThemes, recentObjectionThemes } from "@/lib/salesCallsStats";
import { SalesCall } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prospectName, businessName, industry, notes } = body;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
  }

  const sb = createSupabaseClient();
  const { data: currentVersion, error: versionError } = await sb.from("sales_script_versions").select("*").eq("is_current", true).maybeSingle();
  if (versionError) return NextResponse.json({ error: versionError.message }, { status: 500 });
  if (!currentVersion) return NextResponse.json({ error: "No master script found yet." }, { status: 404 });

  const calls = await fetchAllRows<SalesCall>((from, to) =>
    sb.from("sales_calls").select("*").order("created_at", { ascending: false }).range(from, to));

  try {
    const prep = await generateCallPrep({
      prospectName: prospectName || "",
      businessName: businessName || "",
      industry: industry || "",
      notes: notes || "",
      masterScript: currentVersion.content,
      recentWorkOns: recentWorkOnThemes(calls),
      recentObjections: recentObjectionThemes(calls),
    });
    return NextResponse.json(prep);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
