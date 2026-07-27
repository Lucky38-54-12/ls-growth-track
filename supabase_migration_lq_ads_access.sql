-- Tracks whether a client has told us (via the /connect/[clientId] page)
-- that they've added LS Growth as a partner on their Meta Ad Account.
-- There's no OAuth flow for this like Calendar/Facebook — Meta requires the
-- client to do it by hand in Business Suite — so this is a self-reported
-- confirmation, not a verified connection. Applied directly to the live
-- project; keep this file in sync if the schema changes again.
alter table lq_clients add column if not exists ads_manager_access_confirmed_at timestamptz;
