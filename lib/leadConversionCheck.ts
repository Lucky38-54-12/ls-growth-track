import { createSupabaseClient } from "./supabase";
import { notifySlack } from "./slackNotify";
import { reportAutomationStatus } from "./automationStatus";

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

const CHECK_WEEKDAY = 1; // Monday (UTC), same slot as the other weekly jobs
// Leads need time to actually close, so this compares two past windows
// rather than "this week" — a lead from the last 2 weeks probably hasn't
// had a chance to convert yet either way.
const RECENT_WINDOW_DAYS = [30, 60]; // 30-60 days ago
const PRIOR_WINDOW_DAYS = [60, 90]; // 60-90 days ago
const MIN_RESOLVED_TO_JUDGE = 3; // too few won/lost leads and a rate is just noise
const CONVERSION_DROP_THRESHOLD = 0.3; // 30 percentage points

interface LeadRow {
  job_won_at: string | null;
  job_lost_reason: string | null;
}

function windowBounds(daysAgo: number[]): { since: string; until: string } {
  const now = Date.now();
  return {
    since: new Date(now - daysAgo[1] * 24 * 60 * 60 * 1000).toISOString(),
    until: new Date(now - daysAgo[0] * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function conversionRate(leads: LeadRow[]): { rate: number | null; resolved: number; won: number } {
  const won = leads.filter((l) => l.job_won_at).length;
  const lost = leads.filter((l) => l.job_lost_reason).length;
  const resolved = won + lost;
  return { rate: resolved >= MIN_RESOLVED_TO_JUDGE ? won / resolved : null, resolved, won };
}

// Meta's own "results" metric (lib/creativeDemandCheck.ts) only says leads
// are still coming in at a good cost — it can't see whether those leads are
// actually turning into jobs. This is the other half: compares each
// client's own job-outcome data (lq_leads.job_won_at/job_lost_reason, see
// lib/weeklyCheckin.ts) across two past windows and flags a genuine drop in
// conversion rate, independent of ad spend/results looking fine.
export async function checkLeadConversionTrend(sb: SupabaseClient): Promise<{ sent: boolean; flagged: number }> {
  if (new Date().getUTCDay() !== CHECK_WEEKDAY) return { sent: false, flagged: 0 };

  const { data: clients } = await sb.from("lq_clients").select("id, name").eq("status", "active");
  if (!clients || clients.length === 0) return { sent: false, flagged: 0 };

  const recent = windowBounds(RECENT_WINDOW_DAYS);
  const prior = windowBounds(PRIOR_WINDOW_DAYS);

  const flagged: { name: string; reason: string }[] = [];

  for (const client of clients) {
    const [{ data: recentLeads }, { data: priorLeads }] = await Promise.all([
      sb
        .from("lq_leads")
        .select("job_won_at, job_lost_reason")
        .eq("client_id", client.id)
        .eq("outcome", "qualified")
        .gte("created_at", recent.since)
        .lt("created_at", recent.until),
      sb
        .from("lq_leads")
        .select("job_won_at, job_lost_reason")
        .eq("client_id", client.id)
        .eq("outcome", "qualified")
        .gte("created_at", prior.since)
        .lt("created_at", prior.until),
    ]);

    const recentStats = conversionRate((recentLeads || []) as LeadRow[]);
    const priorStats = conversionRate((priorLeads || []) as LeadRow[]);
    if (recentStats.rate === null || priorStats.rate === null) continue; // not enough resolved leads either window to say anything

    const drop = priorStats.rate - recentStats.rate;
    if (drop >= CONVERSION_DROP_THRESHOLD) {
      flagged.push({
        name: client.name,
        reason: `conversion dropped from ${Math.round(priorStats.rate * 100)}% to ${Math.round(recentStats.rate * 100)}% (${recentStats.won}/${recentStats.resolved} resolved recently vs ${priorStats.won}/${priorStats.resolved} before) — leads are still coming in, fewer are closing`,
      });
    } else if (recentStats.rate === 0 && recentStats.resolved >= MIN_RESOLVED_TO_JUDGE) {
      flagged.push({ name: client.name, reason: `0% conversion on ${recentStats.resolved} resolved leads in the last month — worth a direct call` });
    }
  }

  if (flagged.length === 0) {
    await reportAutomationStatus(sb, "lead-conversion-trend-check", "ok", "No conversion drops flagged");
    return { sent: false, flagged: 0 };
  }

  await notifySlack(
    `📊 Lead conversion dropped for ${flagged.length} client(s) — ad results can look fine while this still happens:\n` +
    flagged.map((f) => `• *${f.name}*: ${f.reason}`).join("\n")
  );

  await reportAutomationStatus(sb, "lead-conversion-trend-check", "ok", `${flagged.length} client(s) flagged`);
  return { sent: true, flagged: flagged.length };
}
