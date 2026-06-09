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
  created_at timestamptz not null default now()
);

create index if not exists email_events_lead_id_idx on email_events (lead_id);
