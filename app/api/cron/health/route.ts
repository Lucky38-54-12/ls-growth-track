import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { getHealthSnapshot } from "@/lib/leads";

export const dynamic = "force-dynamic";

// Read-only diagnostics for the daily monitor routine — deliberately exposes
// no write path, so the monitor only ever needs this bearer secret, never
// direct Supabase credentials. Surfaces the two failure modes that are
// otherwise invisible without opening the dashboard: emails stuck in
// rejection loops, and a sheet sync that's silently stopped running.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createSupabaseClient();
  const snapshot = await getHealthSnapshot(sb);
  return NextResponse.json(snapshot);
}
