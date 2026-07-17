import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// Mirrors app/api/cron/route.ts's own maxDuration — this route had none set,
// so a large due-batch (e.g. a fresh campaign of 50+ leads) got silently
// killed by Vercel's default function timeout mid-loop, with whatever lead
// it was on losing its DB write and the whole request returning nothing to
// the "Send due emails" button. Confirmed 2026-07-17: a 55-lead campaign
// send only got 25 through before the button's request died.
export const maxDuration = 60;
import { createSupabaseClient, fetchAllRows } from "@/lib/supabase";
import { sendNextStepFor } from "@/lib/sendPipeline";
import { Lead } from "@/lib/types";

// Same reasoning as app/api/cron/route.ts: stop cleanly with time to spare
// and report back what actually got through, rather than let Vercel kill the
// function mid-lead with no response at all. Callers (SendButton) can just
// click again to pick up wherever this run left off.
const TIME_BUDGET_MS = 45_000;

export async function POST(req: Request) {
  const startedAt = Date.now();
  const sb = createSupabaseClient();
  // See app/api/cron/route.ts for why this needs an explicit order — without
  // it, paginated fetches of a table under concurrent writes aren't
  // guaranteed stable across requests.
  const leads = await fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").order("lead_id", { ascending: true }).range(from, to));

  let leadIds: string[] | null = null;
  try {
    const body = await req.json();
    if (Array.isArray(body?.leadIds)) leadIds = body.leadIds;
  } catch {}

  let sent = 0, failed = 0, skipped = 0, held = 0;
  const errors: string[] = [];

  const targets = leadIds ? leads.filter((l) => leadIds!.includes(l.lead_id)) : leads;

  let ranOutOfTime = false;
  let processed = 0;
  for (const lead of targets) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      ranOutOfTime = true;
      break;
    }
    processed++;
    try {
      const result = await sendNextStepFor(lead, sb);
      if (result.sent) sent++;
      else if (result.held) held++;
      else skipped++;
    } catch (err: unknown) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${lead.company}: ${msg}`);
    }
  }

  return NextResponse.json({ sent, failed, skipped, held, errors, processed, totalTargets: targets.length, ranOutOfTime });
}
