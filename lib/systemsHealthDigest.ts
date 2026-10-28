import { createSupabaseClient } from "./supabase";
import { notifySlack } from "./slackNotify";
import { checkCronHeartbeats } from "./automationStatus";

type SupabaseClient = ReturnType<typeof createSupabaseClient>;

const DIGEST_WEEKDAY = 1; // Monday (UTC), same slot as the other weekly checks

interface AutomationRow {
  slug: string;
  name: string;
  last_status: "ok" | "error" | null;
  enabled: boolean;
}

// Lucky's own words: he's not going to check /dashboard/automations just to
// see if things are running. Every other alert in this codebase only fires
// when something's wrong — which means silence is ambiguous: it could mean
// everything's fine, or it could mean the whole cron quietly died and
// nothing's checking anything anymore. This is the positive signal instead
// — one Slack message every Monday either way, so "nothing's running" is
// never confused with "I just didn't hear anything."
export async function sendWeeklySystemsHealthIfDue(sb: SupabaseClient): Promise<{ sent: boolean; healthy: boolean }> {
  if (new Date().getUTCDay() !== DIGEST_WEEKDAY) return { sent: false, healthy: true };

  const [{ data: automations }, { stale }] = await Promise.all([
    sb.from("automations").select("slug, name, last_status, enabled"),
    checkCronHeartbeats(sb),
  ]);

  const rows = (automations || []) as AutomationRow[];
  const enabledRows = rows.filter((r) => r.enabled !== false);
  const erroring = enabledRows.filter((r) => r.last_status === "error" && !stale.includes(r.slug));
  const staleRows = enabledRows.filter((r) => stale.includes(r.slug));

  const problems = [...staleRows, ...erroring];

  if (problems.length === 0) {
    await notifySlack(`✅ All systems running smoothly — ${enabledRows.length} automations checked, nothing needs attention.`);
    return { sent: true, healthy: true };
  }

  await notifySlack(
    `⚠️ ${problems.length} of ${enabledRows.length} automations need a look:\n` +
    staleRows.map((r) => `• *${r.name}* — gone quiet, hasn't run on schedule`).join("\n") +
    (staleRows.length && erroring.length ? "\n" : "") +
    erroring.map((r) => `• *${r.name}* — last run errored`).join("\n")
  );
  return { sent: true, healthy: false };
}
