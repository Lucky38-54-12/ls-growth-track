import { NextResponse } from "next/server";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { SalesCall, ScriptVersion } from "@/lib/types";
import { backupSalesCallsToDrive } from "@/lib/salesCallsDrive";

export const dynamic = "force-dynamic";

export async function POST() {
  const apiKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_SERVICE_ACCOUNT_KEY is not configured." }, { status: 500 });
  }

  const sb = createSupabaseClient();
  const [calls, { data: scriptVersions }] = await Promise.all([
    fetchAllRows<SalesCall>((from, to) =>
      sb.from("sales_calls").select("*").order("created_at", { ascending: false }).range(from, to)),
    sb.from("sales_script_versions").select("*").order("version", { ascending: false }),
  ]);

  try {
    const url = await backupSalesCallsToDrive(calls, (scriptVersions || []) as ScriptVersion[]);
    return NextResponse.json({ url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
