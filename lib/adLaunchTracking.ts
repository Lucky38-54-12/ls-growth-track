import { createSupabaseClient } from "./supabase";
import { getAdInsightById } from "./metaAds";
import { insertAdLearning } from "./adLearnings";
import { reportAutomationStatus } from "./automationStatus";

const MIN_DAYS_LIVE_BEFORE_JUDGING = 5;
const MIN_SPEND_TO_JUDGE = 30; // NZD, same floor as creativeDemandCheck

// Stage 07 of the ads engine loop — closes the loop back to Stage 02
// (Ideation). For every combo launched through Stage 06 that's had enough
// time/spend to mean something, pulls that specific ad's real performance
// and banks it as an ad_learning, which generateCreativeHypotheses already
// reads. Flips the combo to "tested" so it stops getting re-checked.
export async function checkLaunchedComboPerformance(): Promise<{ checked: number; errors: string[] }> {
  const sb = createSupabaseClient();
  const errors: string[] = [];

  const cutoff = new Date(Date.now() - MIN_DAYS_LIVE_BEFORE_JUDGING * 24 * 60 * 60 * 1000).toISOString();
  const { data: combos } = await sb
    .from("creative_builder_combos")
    .select("id, client_id, service, offer, angle, hook, meta_ad_id, launched_at")
    .eq("launch_status", "launched")
    .not("meta_ad_id", "is", null)
    .lt("launched_at", cutoff);

  let checked = 0;

  for (const combo of combos || []) {
    try {
      const insight = await getAdInsightById(combo.meta_ad_id as string, "maximum");
      if (!insight || insight.spend < MIN_SPEND_TO_JUDGE) continue;

      const won = insight.results !== null && insight.results > 0;
      const observed = `Launched via the ads engine: ${insight.results ?? 0} results on $${insight.spend.toFixed(0)} spend, cost/result ${insight.costPerResult ? `$${insight.costPerResult.toFixed(2)}` : "n/a"}, CTR ${insight.ctr.toFixed(2)}%.`;

      await insertAdLearning(sb, {
        clientId: combo.client_id,
        service: combo.service,
        angle: combo.angle,
        creative: null,
        hook: combo.hook,
        offer: combo.offer,
        observed,
        inference: won ? "Generated results — worth iterating on this angle/hook." : "Spent without generating results — treat this angle/hook as a loser for now.",
        nextTest: null,
        confidence: "early_signal",
        outcome: won ? "winner" : "loser",
      });

      await sb.from("creative_builder_combos").update({ status: "tested" }).eq("id", combo.id);
      checked++;
    } catch (e) {
      errors.push(`combo ${combo.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const summary = `Checked ${checked} launched combo(s), ${errors.length} error(s)` + (errors.length ? `: ${errors.join("; ")}` : "");
  await reportAutomationStatus(sb, "ad-launch-tracking", errors.length ? "error" : "ok", summary);

  return { checked, errors };
}
