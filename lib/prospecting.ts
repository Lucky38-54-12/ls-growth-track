import { parseCampaignFromTitle } from "./sheets";

export const MAJOR_CITIES = ["Auckland", "Wellington", "Christchurch", "Hamilton", "Tauranga"] as const;

// Canonical trade labels — the same set sheet titles already get parsed into
// by parseCampaignFromTitle's TRADE_MAP, deduped to one label per trade.
export const TRADES = [
  "Cleaning", "Builders", "Plumbing", "Electrical", "Landscaping", "Painting",
  "Roofing", "Removals", "Pest Control", "Renovations", "Floor Coatings", "Fencing",
] as const;

export interface CoverageGap {
  trade: string;
  city: string;
}

function coverageKey(trade: string, city: string): string {
  return `${trade.toLowerCase()}|${city.toLowerCase()}`;
}

// Walks every trade x major-city combo in a stable order and returns the
// first `limit` with no matching sheet in the Email Outreach Drive folder.
// Tops up with whichever covered combos have the fewest existing leads if
// fewer than `limit` are uncovered, so this always returns `limit` results.
export function findCoverageGaps(
  sheetTitles: string[],
  leads: { trade: string; location: string }[],
  limit = 5
): CoverageGap[] {
  const covered = new Set<string>();
  for (const title of sheetTitles) {
    const { trade, location } = parseCampaignFromTitle(title);
    if (!trade || !location) continue;
    const city = location.replace(/\s+NZ$/i, "").trim();
    covered.add(coverageKey(trade, city));
  }

  const uncovered: CoverageGap[] = [];
  for (const trade of TRADES) {
    for (const city of MAJOR_CITIES) {
      if (!covered.has(coverageKey(trade, city))) {
        uncovered.push({ trade, city });
      }
    }
  }
  if (uncovered.length >= limit) return uncovered.slice(0, limit);

  // Not enough uncovered combos — fill the rest with whichever covered
  // combos have the fewest existing leads, ranked lowest-count first.
  const counts = new Map<string, number>();
  for (const trade of TRADES) {
    for (const city of MAJOR_CITIES) {
      counts.set(coverageKey(trade, city), 0);
    }
  }
  for (const lead of leads) {
    const leadTrade = (lead.trade || "").trim();
    const leadLocation = (lead.location || "").toLowerCase();
    const trade = TRADES.find((t) => t.toLowerCase() === leadTrade.toLowerCase());
    if (!trade) continue;
    const city = MAJOR_CITIES.find((c) => leadLocation.includes(c.toLowerCase()));
    if (!city) continue;
    const key = coverageKey(trade, city);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const uncoveredKeys = new Set(uncovered.map((g) => coverageKey(g.trade, g.city)));
  const rankedCovered = TRADES.flatMap((trade) => MAJOR_CITIES.map((city) => ({ trade, city })))
    .filter((g) => !uncoveredKeys.has(coverageKey(g.trade, g.city)))
    .sort((a, b) => (counts.get(coverageKey(a.trade, a.city)) || 0) - (counts.get(coverageKey(b.trade, b.city)) || 0));

  return [...uncovered, ...rankedCovered].slice(0, limit);
}

// Thin wrapper kept for the existing auto-pick behavior in
// app/api/prospect/route.ts when no explicit trade/region is given.
export function findCoverageGap(
  sheetTitles: string[],
  leads: { trade: string; location: string }[]
): CoverageGap {
  return findCoverageGaps(sheetTitles, leads, 1)[0];
}
