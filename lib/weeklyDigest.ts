import { createSupabaseClient, fetchAllRows } from "./supabase";
import { notifySlack } from "./slackNotify";
import { Lead, RevenueClient, RevenueGoal } from "./types";

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

// Folded into daily-maintenance (rather than its own cron slot — Vercel's
// free plan caps at 2, both already spoken for, see that route's comment)
// and gated to fire once a week instead of every day it runs.
const DIGEST_WEEKDAY = 1; // Monday (UTC)

export async function sendWeeklyDigestIfDue(sb: SupabaseClient): Promise<{ sent: boolean }> {
  if (new Date().getUTCDay() !== DIGEST_WEEKDAY) return { sent: false };

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sinceISO = since.toISOString().split("T")[0];

  const [leads, { data: revenueClients }, { data: revenueGoal }] = await Promise.all([
    fetchAllRows<Lead>((from, to) => sb.from("leads").select("*").range(from, to)),
    sb.from("revenue_clients").select("*"),
    sb.from("revenue_goal").select("*").eq("id", 1).maybeSingle(),
  ]);

  const contactedThisWeek = leads.filter((l) => l.date_contacted && l.date_contacted >= sinceISO).length;
  const repliedThisWeek = leads.filter((l) => l.replied_at && l.replied_at >= since.toISOString()).length;
  const bookedThisWeek = leads.filter((l) => (l.status === "booked" || (l.status as string) === "meeting_booked") && l.date_contacted && l.date_contacted >= sinceISO).length;

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const monthlyRevenue = ((revenueClients || []) as RevenueClient[])
    .filter((c) => c.added_at >= monthStart)
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const monthlyGoal = Number((revenueGoal as RevenueGoal | null)?.monthly_goal ?? 0);
  const goalPct = monthlyGoal > 0 ? Math.round((monthlyRevenue / monthlyGoal) * 100) : null;

  const text = [
    `📊 *Weekly digest — last 7 days*`,
    `${contactedThisWeek} leads contacted`,
    `${repliedThisWeek} replies`,
    `${bookedThisWeek} meetings booked`,
    goalPct !== null
      ? `Revenue this month: $${monthlyRevenue.toLocaleString()} / $${monthlyGoal.toLocaleString()} (${goalPct}%)`
      : `Revenue this month: $${monthlyRevenue.toLocaleString()}`,
  ].join("\n");

  await notifySlack(text);
  return { sent: true };
}
