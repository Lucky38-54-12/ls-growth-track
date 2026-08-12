-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Business-task automations (scheduled Claude Code routines, cron jobs,
-- etc.) that Lucky wants visibility into — separate from the email-send
-- log that used to live on /dashboard/automations. Each automation
-- self-reports here after it runs (see /api/admin/automation-status) so
-- the page can show whether it's actually firing, not just that it's
-- configured to.
create table if not exists automations (
  id uuid default gen_random_uuid() primary key,
  slug text unique not null,
  name text not null,
  description text not null default '',
  schedule_label text not null default '',
  kind text not null default 'routine' check (kind in ('routine', 'cron')),
  external_url text,
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_status text check (last_status in ('ok', 'error')),
  last_summary text,
  created_at timestamptz not null default now()
);

insert into automations (slug, name, description, schedule_label, kind, external_url)
values (
  'daily-sheet-triage',
  'Daily Cold-Call Sheet Triage',
  'Picks 3-5 cold-call sheets to focus on each day (mixing proven-momentum campaigns with fresh untouched ones), marks them in Drive, flags segments running low on leads, and posts a Slack summary.',
  'Daily, 7:00 AM NZT',
  'routine',
  'https://claude.ai/code/routines/trig_01Vgywg1iLRnbg1aSGDHnCn1'
)
on conflict (slug) do nothing;
