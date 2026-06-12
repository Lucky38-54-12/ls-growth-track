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
  notes text not null default ''
);

create index if not exists leads_status_idx on leads (status);
create index if not exists leads_email_idx on leads (email);

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
  sent_at timestamptz not null default now()
);

create index if not exists email_sends_lead_id_idx on email_sends (lead_id);
create index if not exists email_sends_sent_at_idx on email_sends (sent_at);
