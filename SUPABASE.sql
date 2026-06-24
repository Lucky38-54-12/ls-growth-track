-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Leads table
create table if not exists leads (
  id uuid default gen_random_uuid() primary key,
  lead_id text unique not null,
  company text not null,
  contact_name text not null default 'there',
  email text not null,
  trade text not null default '',
  location text not null default '',
  status text not null default 'not_contacted',
  date_added date default now(),
  date_contacted date,
  last_followup date,
  followup_count int not null default 0,
  notes text not null default '',
  source text not null default 'email_outreach'
);

-- If leads already existed without this column, run:
-- alter table leads add column if not exists source text not null default 'email_outreach';

-- phone: cold-call leads carry a phone number captured by the scraper —
-- missing from earlier schema versions, causing prospect inserts with a
-- phone number to fail with "Could not find the 'phone' column".
alter table leads add column if not exists phone text;

create index if not exists leads_status_idx on leads (status);
create index if not exists leads_source_idx on leads (source);
create index if not exists leads_email_idx on leads (email);

-- Tracks which calendar bookings have already had a confirmation email sent,
-- so the calendar sync doesn't resend on every run.
create table if not exists calendar_bookings (
  event_id text primary key,
  created_at timestamptz not null default now()
);

-- Email events table (may already exist)
create table if not exists email_events (
  id bigint generated always as identity primary key,
  lead_id text not null,
  event_type text not null check (event_type in ('open', 'click')),
  url text,
  user_agent text,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists email_events_lead_id_idx on email_events (lead_id);

-- If email_events already existed without these columns, run:
-- alter table email_events add column if not exists user_agent text;
-- alter table email_events add column if not exists ip text;

-- Email sends table: one row per email actually sent, used for analytics
-- (open rate / click rate per step and per subject line)
create table if not exists email_sends (
  id bigint generated always as identity primary key,
  lead_id text not null,
  step text not null,
  subject text not null,
  body_html text not null default '',
  sent_at timestamptz not null default now()
);

create index if not exists email_sends_lead_id_idx on email_sends (lead_id);
create index if not exists email_sends_sent_at_idx on email_sends (sent_at);

-- If email_sends already existed without this column, run:
-- alter table email_sends add column if not exists body_html text not null default '';

-- reply_category: tag replies as Interested / Bad Timing / Not Interested / Has Someone
-- Run this migration if the table already exists:
alter table leads
  add column if not exists reply_category text
    check (reply_category in ('interested', 'bad_timing', 'not_interested', 'has_someone'));

-- Tracked sheets — Google Sheets registered for daily auto-sync (Lead Sheets page)
create table if not exists tracked_sheets (
  id uuid default gen_random_uuid() primary key,
  sheet_id text unique not null,
  trade_default text,
  location_default text,
  personalize boolean not null default true,
  send_fresh boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_result text
);

-- New statuses: followup_3_sent, followup_4_sent, sequence_complete, reenroll_queue
-- If you added a CHECK constraint on status previously, drop and recreate it:
-- alter table leads drop constraint if exists leads_status_check;
-- alter table leads add constraint leads_status_check check (status in (
--   'not_contacted','contacted','followup_1_sent','followup_2_sent',
--   'followup_3_sent','followup_4_sent','replied','booked',
--   'not_interested','bounced','sequence_complete','reenroll_queue'
-- ));

-- Campaigns: named, batch-scoped outreach runs (e.g. "Wellington Sparkies").
-- A campaign starts as 'draft' — staging leads via campaign_leads does NOT
-- start sending anything. Only activating it (setting leads.campaign_id)
-- makes /api/send start picking those leads up.
create table if not exists campaigns (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

-- Staged membership, set at creation time regardless of campaign status —
-- lets the draft campaign show "who's in it" before it goes live.
create table if not exists campaign_leads (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id text not null,
  primary key (campaign_id, lead_id)
);

create index if not exists campaign_leads_lead_id_idx on campaign_leads (lead_id);

-- Set on activation only. nextStepFor() and /api/send branch on this to use
-- AI-personalized campaign emails instead of the static template sequence.
alter table leads add column if not exists campaign_id uuid references campaigns(id);
create index if not exists leads_campaign_id_idx on leads (campaign_id);
