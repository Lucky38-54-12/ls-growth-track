export const ONBOARDING_STEPS = [
  { key: "contract_signed",    label: "Contract signed" },
  { key: "kickoff_booked",     label: "Kick-off call booked" },
  { key: "kickoff_done",       label: "Kick-off call completed" },
  { key: "slack_invited",      label: "Added to Slack" },
  { key: "icp_documented",     label: "ICP / target market locked in" },
  { key: "email_setup",        label: "Email account set up & warming" },
  { key: "lead_list_approved", label: "Lead list approved" },
  { key: "templates_approved", label: "Email templates approved" },
  { key: "campaign_launched",  label: "First campaign launched" },
  { key: "first_review",       label: "First results review scheduled" },
];

export const ONBOARDING_PIPELINE_COLUMNS = [
  { key: "meeting_booked",    label: "Discovery Booked" },
  { key: "discovery_done",    label: "Discovery Done" },
  { key: "proposal_sent",     label: "Proposal Sent" },
  { key: "thinking_about_it", label: "Thinking" },
  { key: "onboarding",        label: "Onboarding" },
  { key: "ready_to_launch",   label: "Ready to Launch" },
];

export const ONBOARDING_PIPELINE_STATUSES = new Set(ONBOARDING_PIPELINE_COLUMNS.map((c) => c.key));
