// Zero-dependency trade constants, split out of lib/prospecting.ts so
// client components can import TRADES without dragging googleapis (via
// prospecting.ts -> sheets.ts) into the browser bundle.
export const MAJOR_CITIES = ["Auckland", "Wellington", "Christchurch", "Hamilton", "Tauranga"] as const;

// Canonical trade labels — the same set sheet titles already get parsed into
// by parseCampaignFromTitle's TRADE_MAP, deduped to one label per trade.
export const TRADES = [
  "Cleaning", "Builders", "Plumbing", "Electrical", "Landscaping", "Painting",
  "Roofing", "Removals", "Pest Control", "Renovations", "Floor Coatings", "Fencing",
] as const;
