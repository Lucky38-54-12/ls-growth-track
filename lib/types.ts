export type LeadStatus =
  | "not_contacted"
  | "contacted"
  | "followup_1_sent"
  | "followup_2_sent"
  | "replied"
  | "booked"
  | "not_interested"
  | "bounced"
  | "sequence_complete";

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
}

export interface EmailEvent {
  id: number;
  lead_id: string;
  event_type: "open" | "click";
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
  sent_at: string;
}
