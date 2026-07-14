-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

create table if not exists sales_calls (
  id uuid primary key default gen_random_uuid(),
  call_date date not null default current_date,
  prospect_name text not null default '',
  business_name text not null default '',
  outcome text not null default 'undecided' check (outcome in ('closed', 'follow_up', 'undecided', 'dead')),
  main_objection text default '',
  next_step_booked boolean not null default false,
  next_step_detail text default '',
  went_well text default '',
  work_ons text default '',
  raw_summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists sales_script_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null,
  content text not null,
  changelog text default '',
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists sales_script_proposals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references sales_calls(id) on delete cascade,
  based_on_version int not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  needs_changes boolean not null default false,
  summary text default '',
  diffs jsonb not null default '[]',
  new_content text default '',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- Seed the master script with a starter version so the page always has a
-- current document to show, review calls against, and version from.
insert into sales_script_versions (version, content, changelog, is_current)
select 1,
'Opening
Introduce yourself and LS Growth in one line. Ask how their week has been going before jumping into the pitch.

Discovery
Ask how they currently get new jobs. Ask what a busy month looks like versus a quiet one. Find out if they have run any ads before and how that went.

Pitch
Explain that LS Growth gets trade businesses more booked jobs, not just leads. Use a real proof point with numbers. Keep it about the outcome, never the mechanism.

Objection handling
If they say they are too busy, ask if they want to stay this busy or if things quiet down at some point. If they say ads did not work before, ask what specifically did not work and explain this is different because it is fully managed.

Close
Always lock in a specific next step before hanging up. Either book a proper call or agree on a concrete follow up date. Never end a call with a vague "I will think about it" and no next step.',
'Starter version, not yet informed by any real calls.',
true
where not exists (select 1 from sales_script_versions);
