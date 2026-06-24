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
// first one with no matching sheet in the Email Outreach Drive folder. Falls
// back to whichever combo has the fewest existing leads if every combo
// already has a sheet, so this always returns something to scrape next.
export function findCoverageGap(
  sheetTitles: string[],
  leads: { trade: string; location: string }[]
): CoverageGap {
  const covered = new Set<string>();
  for (const title of sheetTitles) {
    const { trade, location } = parseCampaignFromTitle(title);
    if (!trade || !location) continue;
    const city = location.replace(/\s+NZ$/i, "").trim();
    covered.add(coverageKey(trade, city));
  }

  for (const trade of TRADES) {
    for (const city of MAJOR_CITIES) {
      if (!covered.has(coverageKey(trade, city))) {
        return { trade, city };
      }
    }
  }

  // Every combo already has a sheet — pick the one with the fewest leads.
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

  let best: CoverageGap = { trade: TRADES[0], city: MAJOR_CITIES[0] };
  let bestCount = Infinity;
  for (const trade of TRADES) {
    for (const city of MAJOR_CITIES) {
      const count = counts.get(coverageKey(trade, city)) || 0;
      if (count < bestCount) {
        best = { trade, city };
        bestCount = count;
      }
    }
  }
  return best;
}
