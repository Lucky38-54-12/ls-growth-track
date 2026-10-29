-- Tracks when each client was last included in the biweekly catch-up prep
-- email (see lib/clientCatchupPrep.ts) — per-client, not a shared calendar
-- date, since Lucky's 2-week cadence with each client starts whenever he
-- actually begins meeting them, not a fixed day of the month.
alter table lead_sheet_syncs add column if not exists last_catchup_prep_sent_at timestamptz;
