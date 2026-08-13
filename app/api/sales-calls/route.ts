import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { SalesCall } from "@/lib/types";
import { logSalesCall } from "@/lib/logSalesCall";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = createSupabaseClient();
  const data = await fetchAllRows<SalesCall>((from, to) =>
    sb.from("sales_calls").select("*").order("created_at", { ascending: false }).range(from, to));
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const sb = createSupabaseClient();
  const body = await req.json();
  const rawSummary = body.raw_summary;
  const yourTake = body.your_take || "";

  if (!rawSummary || !String(rawSummary).trim()) {
    return NextResponse.json({ error: "Paste the call summary first." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
  }

  try {
    const { call, proposal, backupUrl } = await logSalesCall(sb, rawSummary, yourTake);
    return NextResponse.json({ call, proposal, backupUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Couldn't read that call: ${message}` }, { status: 502 });
  }
}
