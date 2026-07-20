export type LeadStatus =
  | "not_contacted"
  | "contacted"
  | "followup_1_sent"
  | "followup_2_sent"
  | "followup_3_sent"
  | "followup_4_sent"
  | "replied"
  | "booked"
  | "not_interested"
  | "bounced"
  | "sequence_complete"
  | "reenroll_queue"
  | "no_show"
  | "rebooked"
  | "proposal_sent"
  | "closed"
  | "no_close"
  | "thinking_about_it";

export type ReplyCategory = "interested" | "bad_timing" | "not_interested" | "has_someone";

export interface Lead {
  id: string;
  lead_id: string;
  company: string;
  contact_name: string;
  email: string;
  trade: string;
  location: string;
  status: LeadStatus;
  date_added: string;
  date_contacted: string | null;
  last_followup: string | null;
  followup_count: number;
  notes: string;
  source: string;
  reply_category: ReplyCategory | null;
  website: string | null;
  facebook: string | null;
  personalization_hook: string | null;
  phone: string | null;
  campaign_id: string | null;
  follow_up_at: string | null;
  replied_at: string | null;
  replied_stale_notified: boolean;
  proposal_sent_at: string | null;
  proposal_followup_sent: boolean;
  unsubscribed_at: string | null;
}

export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  created_at: string;
  activated_at: string | null;
}

export const LEAD_SOURCES = ["email_outreach", "cold_call"] as const;

export function sourceLabel(source: string): string {
  if (!source) return "Email Outreach";
  return source.split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
}

export const REPLY_CATEGORY_LABELS: Record<ReplyCategory, string> = {
  interested: "Interested",
  bad_timing: "Bad Timing",
  not_interested: "Not Interested",
  has_someone: "Has Someone",
};

export const REPLY_CATEGORY_COLORS: Record<ReplyCategory, { bg: string; text: string }> = {
  interested:     { bg: "#dcfce7", text: "#15803d" },
  bad_timing:     { bg: "#fef9c3", text: "#854d0e" },
  not_interested: { bg: "#fee2e2", text: "#dc2626" },
  has_someone:    { bg: "#ede9fe", text: "#6d28d9" },
};

export interface EmailEvent {
  id: number;
  lead_id: string;
  event_type: "open" | "click";
  step: string | null;
  url: string | null;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
}

export interface EngagementSummary {
  opens: number;
  clicks: number;
  last_event_at: string | null;
}

export interface EmailSend {
  id: number;
  lead_id: string;
  step: string;
  subject: string;
  body_html: string;
  sent_at: string;
}

export interface EmailCheck {
  id: number;
  lead_id: string;
  step: string;
  subject: string;
  body_html: string;
  verdict: "approved" | "rejected";
  mechanical_fails: string[];
  judgment_flags: string[];
  reasoning: string | null;
  sent: boolean;
  created_at: string;
}

export interface TrackedSheet {
  id: string;
  sheet_id: string;
  trade_default: string | null;
  location_default: string | null;
  active: boolean;
  created_at: string;
  last_synced_at: string | null;
  last_result: string | null;
}

export interface RevenueClient {
  id: string;
  name: string;
  amount: number;
  added_at: string;
}

export interface RevenueGoal {
  id: number;
  monthly_goal: number;
}

export type CallOutcome = "closed" | "follow_up" | "undecided" | "dead";

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  closed: "Closed",
  follow_up: "Follow Up Booked",
  undecided: "Undecided",
  dead: "Dead",
};

export const CALL_OUTCOME_COLORS: Record<CallOutcome, { bg: string; text: string }> = {
  closed:     { bg: "#dcfce7", text: "#15803d" },
  follow_up:  { bg: "#dbeafe", text: "#1d4ed8" },
  undecided:  { bg: "#fef9c3", text: "#854d0e" },
  dead:       { bg: "#f1f5f9", text: "#64748b" },
};

export interface SalesCall {
  id: string;
  call_date: string;
  prospect_name: string;
  business_name: string;
  outcome: CallOutcome;
  main_objection: string;
  next_step_booked: boolean;
  next_step_detail: string;
  went_well: string;
  work_ons: string;
  raw_summary: string;
  created_at: string;
}

export interface ScriptVersion {
  id: string;
  version: number;
  content: string;
  changelog: string;
  is_current: boolean;
  created_at: string;
}

export interface ScriptDiff {
  before: string;
  after: string;
  reason: string;
}

export interface ScriptProposal {
  id: string;
  call_id: string | null;
  based_on_version: number;
  status: "pending" | "approved" | "rejected";
  needs_changes: boolean;
  summary: string;
  diffs: ScriptDiff[];
  new_content: string;
  created_at: string;
  decided_at: string | null;
}

export interface PatternTracker {
  id: string;
  pattern_summary: string;
  status: "open" | "closed";
  cost: "low" | "medium" | "high";
  call_ids: string[];
  occurrences: number;
  fix_proposal_id: string | null;
  fix_applied_at: string | null;
  fix_landing_status: "untested" | "holding" | "not_landing";
  closed_at: string | null;
  closed_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type ContentIdeaStatus = "idea" | "scheduled" | "posted";

export interface ContentIdea {
  id: string;
  title: string;
  notes: string | null;
  post_date: string | null;
  status: ContentIdeaStatus;
  created_at: string;
}

export const CONTENT_IDEA_STATUS_LABELS: Record<ContentIdeaStatus, string> = {
  idea: "Idea",
  scheduled: "Scheduled",
  posted: "Posted",
};

export const CONTENT_IDEA_STATUS_COLORS: Record<ContentIdeaStatus, { bg: string; text: string }> = {
  idea:      { bg: "#f1f5f9", text: "#475569" },
  scheduled: { bg: "#dbeafe", text: "#1e40af" },
  posted:    { bg: "#dcfce7", text: "#166534" },
};

export interface Prospect {
  id: string;
  name: string;
  company: string | null;
  industry: string | null;
  linkedin_url: string | null;
  connected: boolean;
  created_at: string;
}

export interface OnboardingClient {
  id: string;
  name: string;
  company: string;
  email: string | null;
  phone: string | null;
  completed_steps: string[];
  notes: string;
  created_at: string;
  decision_status: "ready" | "thinking";
  follow_up_at: string | null;
  services: string[] | null;
  ads_manager_added: boolean;
  ad_budget: string | null;
  creatives_needed: string | null;
}
