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
  personalize: boolean;
  send_fresh: boolean;
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
