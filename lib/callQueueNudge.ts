import { createSupabaseClient, fetchAllRows } from "./supabase";
import { notifySlack } from "./slackNotify";
import { buildCallQueue, segmentLabel, LOW_QUEUE_THRESHOLD } from "./leads";
import { Lead } from "./types";

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

// Runs inside daily-maintenance so Lucky finds out a trade+city is about to
// run dry without having to open the Call Queue page himself — mirrors the
// low-queue badge on that page, just pushed to Slack instead of pulled.
export async function sendLowQueueNudge(sb: SupabaseClient): Promise<{ sent: boolean; lowSegments: number }> {
  const leads = await fetchAllRows<Lead>((from, to) =>
    sb.from("leads").select("*").eq("source", "cold_call").range(from, to)
  );

  const queue = buildCallQueue(leads);
  const low = queue.freshBySegment.filter((g) => g.leads.length <= LOW_QUEUE_THRESHOLD);

  if (low.length === 0 && queue.callbacksDue.length === 0) {
    return { sent: false, lowSegments: 0 };
  }

  const lines = [`📞 *Call Queue check*`];
  if (queue.callbacksDue.length > 0) {
    lines.push(`${queue.callbacksDue.length} callback${queue.callbacksDue.length !== 1 ? "s" : ""} due today.`);
  }
  if (low.length > 0) {
    lines.push(`Running low on fresh leads:`);
    for (const g of low) {
      lines.push(`• ${segmentLabel(g.trade, g.location)} — ${g.leads.length} left`);
    }
    lines.push(`Scrape more from /dashboard/call-queue or /dashboard/scraper.`);
  }

  await notifySlack(lines.join("\n"));
  return { sent: true, lowSegments: low.length };
}
