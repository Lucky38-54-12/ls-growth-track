import { NextResponse } from "next/server";
import { runSalesCallsBackup } from "@/lib/salesCallsBackupSync";

export const dynamic = "force-dynamic";

export async function POST() {
  const apiKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_SERVICE_ACCOUNT_KEY is not configured." }, { status: 500 });
  }

  try {
    const result = await runSalesCallsBackup();
    return NextResponse.json({ url: result.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
