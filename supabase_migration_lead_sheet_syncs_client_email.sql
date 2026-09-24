-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Where to send the "new booking" notification email for this client — see
-- lib/metaLeadsSheetSync.ts notifyBookedLeads(), fired from
-- /api/cron/sync-lead-sheets right after each sync. Left null = no
-- notification sent for that client (skipped silently) until it's set.
alter table lead_sheet_syncs
  add column if not exists client_email text;
