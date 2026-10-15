import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { reportAutomationStatus } from "@/lib/automationStatus";

// Each /api/cron call self-reports its own round to the automations table,
// but the GitHub Actions workflow calls that route several times per batch
// (looping until the target is hit or nothing's left due) — so the LAST
// round's report always wins, which is usually "0 sent" once the batch has
// drained, masking real send counts from earlier rounds behind a misleading
// "0 sent" status on /dashboard/automations. The workflow tracks the true
// cumulative total across all rounds in bash already; this lets it post
// that real total as the final, authoritative status after the loop ends.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const sent = Number(body.sent) || 0;
  const rounds = Number(body.rounds) || 0;
  const ranOutOfRounds = Boolean(body.ranOutOfRounds);

  const sb = createSupabaseClient();
  await reportAutomationStatus(
    sb,
    "campaign-send-pipeline",
    "ok",
    `Batch complete: ${sent} sent across ${rounds} round(s).` +
      (ranOutOfRounds ? " Hit the round cap — batch may be larger than one run covers." : "")
  );

  return NextResponse.json({ ok: true });
}
