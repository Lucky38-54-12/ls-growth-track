import { SalesCall } from "./types";

export interface CallStats {
  total: number;
  closed: number;
  closeRate: number;
  nextStepRate: number;
  nextStepCount: number;
}

// "Next step rate" counts any call that ended with a locked-in next step OR
// an outright close — a closed deal has nothing left to book, but it's still
// a call that ended somewhere concrete, not left hanging.
export function computeStats(calls: SalesCall[]): CallStats {
  const total = calls.length;
  const closed = calls.filter((c) => c.outcome === "closed").length;
  const nextStepCount = calls.filter((c) => c.next_step_booked || c.outcome === "closed").length;
  return {
    total,
    closed,
    closeRate: total > 0 ? Math.round((closed / total) * 100) : 0,
    nextStepRate: total > 0 ? Math.round((nextStepCount / total) * 100) : 0,
    nextStepCount,
  };
}

function normalizeObjection(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface ObjectionFrequency {
  text: string;
  count: number;
}

export function topObjections(calls: SalesCall[], limit = 5): ObjectionFrequency[] {
  const counts = new Map<string, { display: string; count: number }>();
  for (const c of calls) {
    const raw = c.main_objection?.trim();
    if (!raw) continue;
    const key = normalizeObjection(raw);
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { display: raw, count: 1 });
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((v) => ({ text: v.display, count: v.count }));
}

export interface CallPatterns {
  topObjections: ObjectionFrequency[];
  stallInsight: string;
  trendInsight: string;
  workOnsInsight: string;
}

export function computePatterns(calls: SalesCall[]): CallPatterns {
  const sorted = [...calls].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  const objections = topObjections(calls);

  // Where deals stall: look at calls that didn't close and see how often an
  // objection was actually logged, and which one comes up most among those.
  const notClosed = calls.filter((c) => c.outcome !== "closed");
  const notClosedWithObjection = notClosed.filter((c) => c.main_objection?.trim());
  let stallInsight = "Not enough calls logged yet to tell where deals are stalling.";
  if (notClosed.length >= 3) {
    const pct = Math.round((notClosedWithObjection.length / notClosed.length) * 100);
    if (objections.length > 0) {
      stallInsight = `${pct}% of calls that didn't close had an objection logged. The most common one is "${objections[0].text}", which has come up ${objections[0].count} time${objections[0].count === 1 ? "" : "s"}.`;
    } else {
      stallInsight = `${pct}% of calls that didn't close had an objection logged, but nothing repeats often enough yet to call a pattern.`;
    }
  }

  // Trend: last 10 vs the 10 before that.
  let trendInsight = "Log a few more calls to see a trend on your next step rate.";
  if (sorted.length >= 6) {
    const last10 = sorted.slice(-10);
    const prev10 = sorted.slice(-20, -10);
    const rateOf = (arr: SalesCall[]) => arr.length > 0
      ? Math.round((arr.filter((c) => c.next_step_booked || c.outcome === "closed").length / arr.length) * 100)
      : null;
    const recentRate = rateOf(last10);
    const priorRate = rateOf(prev10);
    if (recentRate !== null && priorRate !== null) {
      const diff = recentRate - priorRate;
      if (diff > 5) trendInsight = `Your next step rate is trending up. It's ${recentRate}% over your last ${last10.length} calls, up from ${priorRate}% before that.`;
      else if (diff < -5) trendInsight = `Your next step rate is trending down. It's ${recentRate}% over your last ${last10.length} calls, down from ${priorRate}%. Worth a look.`;
      else trendInsight = `Your next step rate is holding steady around ${recentRate}% over your last ${last10.length} calls.`;
    } else if (recentRate !== null) {
      trendInsight = `Your next step rate is ${recentRate}% over your last ${last10.length} calls. Not enough earlier calls yet to compare against.`;
    }
  }

  // Work ons: most repeated recent work on theme, shown plainly (exact
  // repeats only — this is a simple frequency read, not a semantic cluster).
  const recentWorkOns = sorted.slice(-10).map((c) => c.work_ons?.trim()).filter(Boolean) as string[];
  let workOnsInsight = "Nothing repeating yet in your work ons.";
  if (recentWorkOns.length > 0) {
    const counts = new Map<string, number>();
    for (const w of recentWorkOns) {
      const key = w.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 1) {
      const original = recentWorkOns.find((w) => w.toLowerCase() === top[0]) || top[0];
      workOnsInsight = `"${original}" has shown up ${top[1]} times in your last ${recentWorkOns.length} calls. Worth actively fixing on your next few calls.`;
    } else {
      workOnsInsight = `No single work on repeats yet across your last ${recentWorkOns.length} calls.`;
    }
  }

  return { topObjections: objections, stallInsight, trendInsight, workOnsInsight };
}

// Used by the call prep generator to ground its output in real recent history.
export function recentWorkOnThemes(calls: SalesCall[], limit = 10): string[] {
  return [...calls]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((c) => c.work_ons?.trim())
    .filter((w): w is string => !!w)
    .slice(0, limit);
}

export function recentObjectionThemes(calls: SalesCall[], limit = 10): string[] {
  return topObjections(calls, limit).map((o) => o.text);
}
