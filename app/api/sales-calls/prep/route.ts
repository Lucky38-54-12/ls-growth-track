import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { prepSalesCall } from "@/lib/prepSalesCall";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { notes } = body;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
  }

  const sb = createSupabaseClient();
  try {
    const prep = await prepSalesCall(sb, notes || "");
    return NextResponse.json(prep);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "No master script found yet." ? 404 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
