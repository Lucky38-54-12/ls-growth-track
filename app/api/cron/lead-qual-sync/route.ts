import { NextRequest, NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase";
import { backfillLeadsForClient } from "@/lib/leadQual/leadAdsBackfill";
import { notifySlack } from "@/lib/slackNotify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily safety net on top of the live webhook: catches Lead Ad form
// submissions the webhook missed (token permission gaps, Meta retries that
// never landed, a Page reconnected mid-day) so the portal never silently
// drifts behind what's actually in the client's form. backfillLeadsForClient
// is dedupe-safe (checks leadgen_id before inserting), so re-checking every
// client's full history daily costs nothing beyond the Graph API calls
// themselves — no AI spend, unlike the Anthropic-heavy jobs in
// daily-maintenance.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createSupabaseClient();
  const { data: clients } = await sb.from("lq_clients").select("id, name");

  const results: { client: string; imported: number; error?: string }[] = [];

  for (const client of clients || []) {
    try {
      const result = await backfillLeadsForClient(client.id);
      results.push({ client: client.name, imported: result.leadsImported });
    } catch (err: any) {
      // "no connected Facebook Page" just means this client hasn't hooked
      // up a Page yet — not a sync failure worth alerting on.
      const message = err?.message || "unknown error";
      if (message.includes("no connected Facebook Page")) continue;
      results.push({ client: client.name, imported: 0, error: message });
    }
  }

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
