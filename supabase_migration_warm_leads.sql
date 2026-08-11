-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Leads pulled from the cold-call sheet archive whose outcome notes showed
-- real interest (not just "busy right now") — curated by hand from
-- /api/admin/scan-callback-notes results, since the raw sheet outcomes mix
-- genuine warm leads in with plain "no" and "booked out, not interested"
-- rows. Shown on the Call Queue page as a separate warm-leads list.
create table if not exists warm_leads (
  id uuid default gen_random_uuid() primary key,
  company text not null,
  phone text,
  email text,
  trade text not null default '',
  location text not null default '',
  note text not null,
  called boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_warm_leads_called on warm_leads (called);
