import { Lead, LeadStatus } from "./types";

const DAYS_BEFORE_FOLLOWUP_1 = 4;
const DAYS_BEFORE_FOLLOWUP_2 = 7;

const TERMINAL_STATUSES = new Set<LeadStatus>([
  "replied",
  "booked",
  "not_interested",
  "bounced",
  "sequence_complete",
]);

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const then = new Date(dateStr + "T00:00:00Z");
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

export type EmailStep = "initial" | "followup1" | "followup2";

export function nextStepFor(lead: Lead): EmailStep | null {
  const status = lead.status;
  if (TERMINAL_STATUSES.has(status)) return null;
  if (status === "not_contacted" || !lead.date_contacted) return "initial";
  if (status === "contacted") {
    const d = daysSince(lead.date_contacted);
    return d !== null && d >= DAYS_BEFORE_FOLLOWUP_1 ? "followup1" : null;
  }
  if (status === "followup_1_sent") {
    const d = daysSince(lead.last_followup || lead.date_contacted);
    return d !== null && d >= DAYS_BEFORE_FOLLOWUP_2 ? "followup2" : null;
  }
  return null;
}

export const STEP_NEW_STATUS: Record<EmailStep, LeadStatus> = {
  initial: "contacted",
  followup1: "followup_1_sent",
  followup2: "followup_2_sent",
};

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "lead"
  );
}

export function generateLeadId(company: string, existingIds: Set<string>): string {
  const base = slugify(company);
  let candidate = base;
  let n = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-${n}`;
    n++;
  }
  return candidate;
}

// Groups leads into campaign "segments" by trade+location, e.g. trade=Cleaning,
// location="Wellington NZ" -> "Wellington Cleaning Companies". Used to organize
// the Contacts and Send Queue pages by campaign.
export interface Segment {
  key: string;
  trade: string;
  location: string;
  count: number;
}

export function segmentKey(trade: string, location: string): string {
  return `${(trade || "").trim().toLowerCase()}|${(location || "").trim().toLowerCase()}`;
}

export function segmentLabel(trade: string, location: string): string {
  const shortLocation = location.replace(/\s+(NZ|AU|USA|UK)$/i, "").trim() || location;
  const tradeLabel = trade.charAt(0).toUpperCase() + trade.slice(1);
  return `${shortLocation} ${tradeLabel} Companies`;
}

export function groupBySegment(items: { trade: string; location: string }[]): Segment[] {
  const map = new Map<string, Segment>();
  for (const item of items) {
    const trade = (item.trade || "").trim();
    const location = (item.location || "").trim();
    if (!trade || !location) continue;
    const key = segmentKey(trade, location);
    const entry = map.get(key);
    if (entry) entry.count++;
    else map.set(key, { key, trade, location, count: 1 });
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}
