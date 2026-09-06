import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { backfillLeadsForClient } from "@/lib/leadQual/leadAdsBackfill";
import { notifySlack } from "@/lib/slackNotify";

export const dynamic = "force-dynamic";
// Was 60s, but this loops over every client's full Lead Ad history
// sequentially (Graph API + DB round trips per lead) and has been timing
// out intermittently since June as the client list grew. Bumped to the
// same ceiling used elsewhere (brain/chat, campaign-brief) plus running
// clients concurrently below, since each client's backfill is independent.
export const maxDuration = 280;

// Twice-daily safety net on top of the live webhook (6am and 12pm NZT, see
// .github/workflows/cron.yml): catches Lead Ad form submissions the webhook
// missed (token permission gaps, Meta retries that never landed, a Page
// reconnected mid-day) so the portal never silently drifts behind what's
// actually in the client's form, and a morning miss doesn't sit unnoticed
// until the next day. backfillLeadsForClient is dedupe-safe (checks
// leadgen_id before inserting), so re-checking every client's full history
// twice a day costs nothing beyond the Graph API calls themselves — no AI
// spend, unlike the Anthropic-heavy jobs in daily-maintenance.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createSupabaseClient();
  const { data: clients } = await sb.from("lq_clients").select("id, name");

  // Each client's backfill is independent (own Page token, own leads), so
  // run them concurrently instead of one at a time — the sequential version
  // was blowing past the function timeout once there were enough clients.
  const settled = await Promise.all(
    (clients || []).map(async (client) => {
      try {
        const result = await backfillLeadsForClient(client.id);
        return { client: client.name, imported: result.leadsImported };
      } catch (err: any) {
        // "no connected Facebook Page" just means this client hasn't hooked
        // up a Page yet — not a sync failure worth alerting on.
        const message = err?.message || "unknown error";
        if (message.includes("no connected Facebook Page")) return null;
        return { client: client.name, imported: 0, error: message };
      }
    })
  );
  const results = settled.filter((r): r is { client: string; imported: number; error?: string } => r !== null);

  const newLeads = results.filter((r) => r.imported > 0);
  const failed = results.filter((r) => r.error);

  if (newLeads.length || failed.length) {
    const lines = [
      ...newLeads.map((r) => `+${r.imported} new lead${r.imported === 1 ? "" : "s"} — ${r.client}`),
      ...failed.map((r) => `⚠️ ${r.client} sync failed: ${r.error}`),
    ];
    await notifySlack(`📋 Daily lead-qual sync\n${lines.join("\n")}`);
  }

  return NextResponse.json({ results });
}
