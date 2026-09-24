-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- One row per client's Meta Lead Ads spreadsheet — see lib/metaLeadsSheetSync.ts.
-- Each client's raw ad-form tabs (Sheet1, Sheet2, ...) stay completely
-- untouched; this just tracks which spreadsheet + which normalized target
-- tab to sync new leads into, so the cron can loop over every client
-- instead of one hardcoded spreadsheet.
create table if not exists lead_sheet_syncs (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  spreadsheet_id text not null unique,
  target_tab text not null default 'All Leads',
  onboarding_client_id uuid references onboarding_clients(id),
  last_synced_at timestamptz,
  last_sync_added int,
  last_sync_error text,
  created_at timestamptz default now()
);
