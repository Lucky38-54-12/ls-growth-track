-- Run this once in Supabase Dashboard → SQL Editor → New query → Run
-- Lets the dashboard auto-sync any number of Google Sheets daily (replaces
-- the old "paste a Sheet ID and click Sync" manual flow, and the single
-- hardcoded sheet in app/api/cron/sheet-sync/route.ts).

create table if not exists tracked_sheets (
  id uuid primary key default gen_random_uuid(),
  sheet_id text not null unique,
  trade_default text,
  location_default text,
  personalize boolean not null default true,
  send_fresh boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_result text
);

-- Carry over the sheet that was previously hardcoded into the cron route,
-- so it keeps syncing with its existing (sync-only, no sends) behaviour.
insert into tracked_sheets (sheet_id, trade_default, location_default, personalize, send_fresh)
values ('12yHXFppiVEMckNP2JCA1-PHj-u7jRvTt7hnVl-9cGbk', 'Cleaning', 'Wellington NZ', false, false)
on conflict (sheet_id) do nothing;
