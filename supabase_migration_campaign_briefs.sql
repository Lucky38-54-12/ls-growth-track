-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Campaign Setup, Stage 01 — STRATEGY. One researched-and-editable brief per
-- onboarded client (lq_clients), generated via lib/campaignBrief.ts (Claude +
-- web_search) either from /dashboard/campaign-setup or the Brain chat
-- (app/api/brain/chat/route.ts, kind "campaign_brief"). Regenerating
-- overwrites in place for now — a history table can come later if needed.
create table campaign_briefs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references lq_clients(id) on delete cascade unique,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  offer_pricing text not null default '',
  main_service text not null default '',
  ideal_customer text not null default '',
  service_area text not null default '',
  job_value_margins text not null default '',
  competitor_research text not null default '',
  objective text not null default '',
  budget text not null default '',
  targeting_approach text not null default '',
  lead_qualification_criteria text not null default '',
  retargeting_strategy text not null default '',
  doc_markdown text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
