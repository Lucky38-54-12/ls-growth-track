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
