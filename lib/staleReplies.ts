import { createSupabaseClient, fetchAllRows } from "./supabase";
import { notifySlack } from "./slackNotify";
import { Lead } from "./types";

const STALE_DAYS = 2;

// A lead sitting in "replied" is waiting on a human — the Today page surfaces
// it, but only if Lucky happens to check. This escalates once via Slack after
// it's sat untouched for STALE_DAYS, using replied_stale_notified so it only
// nags once per reply (reset whenever a lead freshly becomes "replied" again,
// see statusTimestampUpdates in lib/leads.ts).
export async function escalateStaleReplies(): Promise<{ notified: number }> {
  const sb = createSupabaseClient();
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const leads = await fetchAllRows<Lead>((from, to) =>
    sb.from("leads")
      .select("*")
      .eq("status", "replied")
      .eq("replied_stale_notified", false)
      .lte("replied_at", cutoff)
      .range(from, to)
  );

  if (!leads.length) return { notified: 0 };

  const appUrl = process.env.APP_URL || "https://app.lsgrowth.agency";
  const lines = leads.map((l) => `• *${l.company}* — replied ${STALE_DAYS}+ days ago, still untouched — ${appUrl}/dashboard/leads/${l.lead_id}`);
  await notifySlack(`⏰ ${leads.length} repl${leads.length === 1 ? "y" : "ies"} sitting untouched:\n${lines.join("\n")}`);

  await sb.from("leads").update({ replied_stale_notified: true }).in("lead_id", leads.map((l) => l.lead_id));
  return { notified: leads.length };
}
