import { NextRequest, NextResponse } from "next/server";
import { checkForReplies } from "@/lib/campaignReplies";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Not on Vercel's own cron schedule (Hobby plan caps that at 2 jobs, both
// already spoken for) — this is called by the external daily monitor agent
// instead, authenticated the same way the other /api/cron/* routes are.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await checkForReplies();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
