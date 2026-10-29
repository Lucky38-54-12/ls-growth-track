-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Per-client throttle so the daily-maintenance "creative demand" check only
-- re-analyses (and re-spends Anthropic tokens on) a given client every few
-- days, not every single cron run.
alter table lq_clients
  add column if not exists last_creative_demand_check_at timestamptz;

-- Dedicated footage-folder link for ad production (Phase 2), kept separate
-- from onboarding_clients.portal_photos_folder_url because that join
-- (onboarding_clients.lq_client_id) is nullable and only populated on one
-- onboarding branch — not reliable enough to build a production pipeline on.
alter table lq_clients
  add column if not exists ad_footage_folder_url text;

insert into automations (slug, name, description, schedule_label, kind)
values (
  'creative-demand-check',
  'Creative Demand Check',
  'Runs inside daily-maintenance: flags clients whose Meta results have dropped or whose cost-per-result has risen week-over-week, and auto-reruns the Creative Brain for them.',
  'Daily (per-client throttled to every 3 days)',
  'routine'
)
on conflict (slug) do nothing;
