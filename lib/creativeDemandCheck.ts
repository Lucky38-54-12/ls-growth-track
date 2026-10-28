import { createSupabaseClient } from "./supabase";
import { getAdCreatives } from "./metaAds";
import { generateCreativeHypotheses } from "./creativeBrain";
import { reportAutomationStatus } from "./automationStatus";
import { notifySlack } from "./slackNotify";

const THROTTLE_DAYS = 3;
const MIN_SPEND_TO_JUDGE = 30; // NZD — below this, a week's data is too thin to call a trend
const RESULTS_DROP_THRESHOLD = 0.4; // 40% fewer results week-over-week
const CPL_RISE_THRESHOLD = 0.4; // 40% worse cost-per-result week-over-week

interface ClientCheckResult {
  clientId: string;
  clientName: string;
  flagged: boolean;
  reason: string | null;
}

function sumSpendAndResults(ads: { spend: number; results: number | null }[]): { spend: number; results: number } {
  let spend = 0;
  let results = 0;
  for (const a of ads) {
    spend += a.spend;
    results += a.results || 0;
  }
  return { spend, results };
}

// Compares the most recent 7 days against the 7 days before that (derived
// from a last_14d pull minus a last_7d pull, since Meta has no "previous
// week" date_preset) and flags a client whose results have genuinely
// dropped or whose cost-per-result has genuinely worsened — guarded by a
// minimum spend floor on both windows so a quiet week on a tiny account
// doesn't read as a crash. Mirrors the evidence-discipline the Creative
// Brain prompt itself enforces (see lib/creativeBrain.ts) rather than
// reacting to noise.
function diagnoseTrend(last7: { spend: number; results: number }, prior7: { spend: number; results: number }): { flagged: boolean; reason: string | null } {
  if (last7.spend < MIN_SPEND_TO_JUDGE || prior7.spend < MIN_SPEND_TO_JUDGE) {
    return { flagged: false, reason: null };
  }

  if (prior7.results > 0) {
    const resultsChange = (last7.results - prior7.results) / prior7.results;
    if (resultsChange <= -RESULTS_DROP_THRESHOLD) {
      return {
        flagged: true,
        reason: `Results dropped ${Math.round(Math.abs(resultsChange) * 100)}% week-over-week (${prior7.results} → ${last7.results}) on comparable spend ($${prior7.spend.toFixed(0)} → $${last7.spend.toFixed(0)})`,
      };
    }
  }

  const cplLast7 = last7.results > 0 ? last7.spend / last7.results : null;
  const cplPrior7 = prior7.results > 0 ? prior7.spend / prior7.results : null;
  if (cplLast7 !== null && cplPrior7 !== null && cplPrior7 > 0) {
    const cplChange = (cplLast7 - cplPrior7) / cplPrior7;
    if (cplChange >= CPL_RISE_THRESHOLD) {
      return {
        flagged: true,
        reason: `Cost per result rose ${Math.round(cplChange * 100)}% week-over-week ($${cplPrior7.toFixed(2)} → $${cplLast7.toFixed(2)})`,
      };
    }
  }

  // Spending at a reasonable level but generating zero results at all in the
  // most recent window is its own signal, independent of the prior window.
  if (last7.results === 0) {
    return { flagged: true, reason: `$${last7.spend.toFixed(0)} spent in the last 7 days with zero results` };
  }

  return { flagged: false, reason: null };
}

// Daily-maintenance sub-job: for every client with a live Meta ad account,
// checks whether results have run low and — if so — auto-reruns the
// Creative Brain (lib/creativeBrain.ts) so Lucky gets new angles/scripts to
// review without having to remember to open /dashboard/meta-ads himself.
// Throttled per-client (not just per-day like the rest of daily-maintenance)
// so a client already flagged this week doesn't re-trigger the Brain (and
// re-spend Anthropic tokens) again tomorrow.
export async function checkCreativeDemand(): Promise<{ checked: number; flagged: ClientCheckResult[]; errors: string[] }> {
  const sb = createSupabaseClient();
  const errors: string[] = [];

  const throttleCutoff = new Date(Date.now() - THROTTLE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: clients } = await sb
    .from("lq_clients")
    .select("id, name, meta_ad_account_id, last_creative_demand_check_at")
    .not("meta_ad_account_id", "is", null);

  const due = (clients || []).filter(
    (c) => !c.last_creative_demand_check_at || c.last_creative_demand_check_at < throttleCutoff
  );

  const flagged: ClientCheckResult[] = [];

  for (const client of due) {
    try {
      const [last7, last14] = await Promise.all([
        getAdCreatives(client.meta_ad_account_id as string, "last_7d"),
        getAdCreatives(client.meta_ad_account_id as string, "last_14d"),
      ]);

      const last7Totals = sumSpendAndResults(last7);
      const last14Totals = sumSpendAndResults(last14);
      const prior7Totals = { spend: last14Totals.spend - last7Totals.spend, results: last14Totals.results - last7Totals.results };

      const diagnosis = diagnoseTrend(last7Totals, prior7Totals);

      if (diagnosis.flagged) {
        await generateCreativeHypotheses(client.id).catch((e) => {
          errors.push(`${client.name}: creative brain run failed — ${e instanceof Error ? e.message : String(e)}`);
        });
      }

      flagged.push({ clientId: client.id, clientName: client.name, flagged: diagnosis.flagged, reason: diagnosis.reason });
      await sb.from("lq_clients").update({ last_creative_demand_check_at: new Date().toISOString() }).eq("id", client.id);
    } catch (e) {
      errors.push(`${client.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const flaggedOnly = flagged.filter((f) => f.flagged);
  const summary = `Checked ${due.length} client(s), ${flaggedOnly.length} flagged`;
  await reportAutomationStatus(sb, "creative-demand-check", errors.length ? "error" : "ok", summary);

  // The whole point of catching this here is so Lucky hears about a
  // performance drop within days, not at month-end from the client — this
  // was previously detected but never surfaced anywhere.
  if (flaggedOnly.length > 0) {
    await notifySlack(
      `📉 Ad performance dropped for ${flaggedOnly.length} client(s) — worth a look before they notice:\n` +
      flaggedOnly.map((f) => `• *${f.clientName}*: ${f.reason}`).join("\n") +
      `\nNew creative angles already queued up in /dashboard/meta-ads.`
    );
  }

  return { checked: due.length, flagged: flaggedOnly, errors };
}
