import { Lead, LeadStatus, EmailCheck, EmailSend, TrackedSheet } from "./types";
import { createSupabaseClient } from "./supabase";

// Every write site that can flip a lead's status to "replied" or
// "proposal_sent" (drag-and-drop, call follow-up, reply detection, onboarding
// recap sync) should merge this into its update object — without a captured
// timestamp, the stale-reply escalation and proposal-followup automations
// have no way to know how long a lead has been sitting there.
export function statusTimestampUpdates(newStatus: string): Record<string, unknown> {
  if (newStatus === "replied") return { replied_at: new Date().toISOString(), replied_stale_notified: false };
  if (newStatus === "proposal_sent") return { proposal_sent_at: new Date().toISOString(), proposal_followup_sent: false };
  return {};
}

// Timing is measured from date_contacted (the initial email send date)
const DAYS_FOLLOWUP_1 = 3;   // Day 3:  short follow-up
const DAYS_FOLLOWUP_2 = 7;   // Day 7:  social proof / case study
const DAYS_FOLLOWUP_3 = 14;  // Day 14: last chance
const DAYS_FOLLOWUP_4 = 21;  // Day 21: breakup email

// Re-enrolment windows
const DAYS_REENROLL_DEFAULT     = 60; // after sequence_complete with no reply
const DAYS_REENROLL_HAS_SOMEONE = 90; // if they replied "has_someone"

const TERMINAL_STATUSES = new Set<LeadStatus>([
  "replied",
  "booked",
  "not_interested",
  "bounced",
]);

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const then = new Date(dateStr + "T00:00:00Z");
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

export type EmailStep = "initial" | "followup1" | "followup2" | "followup3" | "followup4" | "checkin";

// Campaign leads keep nudging instead of going quiet after followup4 — Lucky
// wants AI check-ins to continue until they book, not a hard stop at day 21.
const DAYS_CAMPAIGN_CHECKIN = 30;

export function nextStepFor(lead: Lead): EmailStep | null {
  const { status, date_contacted, last_followup, reply_category, campaign_id } = lead;

  if (TERMINAL_STATUSES.has(status)) return null;

  // Re-enrol queue — treat like not_contacted (restart at initial)
  if (status === "reenroll_queue") return "initial";

  // Leads that completed the sequence — check if re-enrol window has passed.
  // Campaign leads use a shorter, indefinite check-in cadence instead of the
  // default 60/90-day re-enrol window, since the campaign should keep
  // nudging until the lead books or replies.
  if (status === "sequence_complete") {
    const refDate = last_followup || date_contacted;
    const days = daysSince(refDate);
    const threshold = campaign_id
      ? DAYS_CAMPAIGN_CHECKIN
      : reply_category === "has_someone" ? DAYS_REENROLL_HAS_SOMEONE : DAYS_REENROLL_DEFAULT;
    const dueStep: EmailStep = campaign_id ? "checkin" : "initial";
    return days !== null && days >= threshold ? dueStep : null;
  }

  // Cold-call leads not (yet) in a campaign get a one-off personalized email
  // sent manually via the Cold Call page (called → emailed → meeting_booked)
  // — they never go through the generic templated sequence. Once a cold-call
  // lead is added to a campaign (campaign_id set), it should follow that
  // campaign's sequence like any other member.
  if (lead.source === "cold_call" && !campaign_id) return null;

  // Not yet started
  if (status === "not_contacted" || !date_contacted) return "initial";

  // All follow-ups are measured from date_contacted (the initial send date)
  const daysSinceContact = daysSince(date_contacted);
  if (daysSinceContact === null) return null;

  if (status === "contacted")      return daysSinceContact >= DAYS_FOLLOWUP_1 ? "followup1" : null;
  if (status === "followup_1_sent") return daysSinceContact >= DAYS_FOLLOWUP_2 ? "followup2" : null;
  if (status === "followup_2_sent") return daysSinceContact >= DAYS_FOLLOWUP_3 ? "followup3" : null;
  if (status === "followup_3_sent") return daysSinceContact >= DAYS_FOLLOWUP_4 ? "followup4" : null;
  // followup_4_sent → sequence_complete is set immediately after send (in the API), not here

  return null;
}

// Status to set after each step is sent. followup4 completes the sequence.
export const STEP_NEW_STATUS: Record<EmailStep, LeadStatus> = {
  initial:   "contacted",
  followup1: "followup_1_sent",
  followup2: "followup_2_sent",
  followup3: "followup_3_sent",
  followup4: "sequence_complete", // breakup email = sequence done
  checkin: "sequence_complete", // stays in sequence_complete so the 30-day check-in loop repeats
};

// Returns true if this sequence_complete lead is due for re-enrolment
// but hasn't yet been re-enrolled. Used to populate the Re-enrol Queue section.
export function isReadyForReenroll(lead: Lead): boolean {
  if (lead.status !== "sequence_complete") return false;
  const refDate = lead.last_followup || lead.date_contacted;
  const days = daysSince(refDate);
  if (days === null) return false;
  const threshold =
    lead.reply_category === "has_someone" ? DAYS_REENROLL_HAS_SOMEONE : DAYS_REENROLL_DEFAULT;
  return days >= threshold;
}

// Days remaining until a sequence_complete lead is eligible for re-enrolment.
export function daysUntilReenroll(lead: Lead): number | null {
  if (lead.status !== "sequence_complete") return null;
  const refDate = lead.last_followup || lead.date_contacted;
  const days = daysSince(refDate);
  if (days === null) return null;
  const threshold =
    lead.reply_category === "has_someone" ? DAYS_REENROLL_HAS_SOMEONE : DAYS_REENROLL_DEFAULT;
  return Math.max(0, threshold - days);
}

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

// Groups leads into campaign "segments" by trade+location.
export interface Segment {
  key: string;
  trade: string;
  location: string;
  count: number;
}

export const UNCATEGORIZED_KEY = "__uncategorized__";

export function segmentKey(trade: string, location: string): string {
  const t = (trade || "").trim().toLowerCase();
  if (!t) return UNCATEGORIZED_KEY;
  return `${t}|${(location || "").trim().toLowerCase()}`;
}

export function segmentLabel(trade: string, location: string): string {
  if (!trade?.trim()) return "Uncategorized";
  const tradeLabel = trade.charAt(0).toUpperCase() + trade.slice(1);
  if (!location?.trim()) return `${tradeLabel} Companies`;
  const shortLocation = location.replace(/\s+(NZ|AU|USA|UK)$/i, "").trim() || location;
  return `${shortLocation} ${tradeLabel} Companies`;
}

// Major NZ regions to rotate through for auto-prospecting, biggest markets first.
export const PROSPECT_REGIONS = [
  "Auckland", "Wellington", "Christchurch", "Hamilton", "Tauranga",
  "Dunedin", "Palmerston North", "Napier", "Nelson", "Rotorua",
  "New Plymouth", "Whangarei", "Invercargill", "Queenstown",
] as const;

// Picks the region with the fewest existing leads for this trade, so the
// auto-prospector spreads coverage across the country instead of hammering
// the same city every time. Ties broken by PROSPECT_REGIONS order.
export function pickNextRegion(existingLeads: { trade: string; location: string }[], trade: string): string {
  const counts = new Map<string, number>(PROSPECT_REGIONS.map((r) => [r, 0]));
  for (const lead of existingLeads) {
    if ((lead.trade || "").trim().toLowerCase() !== trade.toLowerCase()) continue;
    const region = PROSPECT_REGIONS.find((r) => (lead.location || "").toLowerCase().includes(r.toLowerCase()));
    if (region) counts.set(region, (counts.get(region) || 0) + 1);
  }
  let best: string = PROSPECT_REGIONS[0];
  let bestCount = Infinity;
  for (const region of PROSPECT_REGIONS) {
    const count = counts.get(region) || 0;
    if (count < bestCount) {
      best = region;
      bestCount = count;
    }
  }
  return best;
}

// A rejected email_checks row is never deleted, and the pipeline retries
// automatically on its next run (see sendPipeline.ts) — so a lead that got
// rejected a few times before an eventual approved send still has all those
// old rejections sitting in the table. Without this filter, every dashboard
// "Needs Your Attention" / "Held For Review" view would keep showing a lead
// as held forever, even after it was successfully emailed for that step.
export function stillHeld<C extends { lead_id: string; step: string }>(
  checks: C[],
  sends: { lead_id: string; step: string }[]
): C[] {
  const sentStepKeys = new Set(sends.map((s) => `${s.lead_id}::${s.step}`));
  return checks.filter((c) => !sentStepKeys.has(`${c.lead_id}::${c.step}`));
}

export interface HealthSnapshot {
  stuck_held_emails: number;
  stuck_over_24h: number;
  stuck_examples: { lead_id: string; step: string; created_at: string; reasoning: string | null }[];
  stale_sheet_syncs: { sheet_id: string; last_synced_at: string | null }[];
}

// Shared by the daily cron health-check route and the on-demand Slack
// "health_check" action so the two never drift out of sync with each other.
export async function getHealthSnapshot(
  sb: ReturnType<typeof createSupabaseClient>
): Promise<HealthSnapshot> {
  const [{ data: checks }, { data: sends }, { data: sheets }] = await Promise.all([
    sb.from("email_checks").select("*").order("created_at", { ascending: false }),
    sb.from("email_sends").select("*"),
    sb.from("tracked_sheets").select("*").eq("active", true),
  ]);

  const allChecks = (checks || []) as EmailCheck[];
  const allSends = (sends || []) as EmailSend[];
  const rejected = allChecks.filter((c) => c.verdict === "rejected");
  const stuck = stillHeld(rejected, allSends);

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const stuckOverADay = stuck.filter((c) => new Date(c.created_at).getTime() < oneDayAgo);

  const staleSheets = ((sheets || []) as TrackedSheet[]).filter((s) => {
    if (!s.last_synced_at) return true;
    return Date.now() - new Date(s.last_synced_at).getTime() > 2 * 24 * 60 * 60 * 1000;
  });

  return {
    stuck_held_emails: stuck.length,
    stuck_over_24h: stuckOverADay.length,
    stuck_examples: stuckOverADay.slice(0, 5).map((c) => ({
      lead_id: c.lead_id,
      step: c.step,
      created_at: c.created_at,
      reasoning: c.reasoning,
    })),
    stale_sheet_syncs: staleSheets.map((s) => ({
      sheet_id: s.sheet_id,
      last_synced_at: s.last_synced_at,
    })),
  };
}

export function groupBySegment(items: { trade: string; location: string }[]): Segment[] {
  const map = new Map<string, Segment>();
  for (const item of items) {
    const trade = (item.trade || "").trim();
    const location = (item.location || "").trim();
    const key = segmentKey(trade, location);
    const entry = map.get(key);
    if (entry) entry.count++;
    else map.set(key, { key, trade, location, count: 1 });
  }
  // Uncategorized always sorts last; everything else by count desc.
  return Array.from(map.values()).sort((a, b) => {
    if (a.key === UNCATEGORIZED_KEY) return 1;
    if (b.key === UNCATEGORIZED_KEY) return -1;
    return b.count - a.count;
  });
}
