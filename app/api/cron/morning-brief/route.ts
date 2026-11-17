import { NextRequest, NextResponse } from "next/server";
import { sendMorningBrief } from "@/lib/morningBrief";

export const dynamic = "force-dynamic";
// Production logs show this has actually hit the old 60s ceiling (unlike
// the deliberate early-stop design in app/api/cron/route.ts, there's no
// self-pacing batch logic here — it just needs more headroom).
export const maxDuration = 280;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendMorningBrief();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "morning brief failed" }, { status: 500 });
  }
}
