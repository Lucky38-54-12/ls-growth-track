-- Applied directly to the live project.

-- Tracks whether a client has told us (via the /connect/[clientId] page)
-- that they've added Lucky as an admin on their Facebook Page. Unlike
-- Calendar/Facebook (real OAuth), this is a self-reported step — the
-- eventual agency-side "Connect Facebook" OAuth (lib/leadQual/facebookOAuth.ts)
-- is what actually verifies it worked, by returning the Page in /me/accounts.
alter table lq_clients add column if not exists page_access_confirmed_at timestamptz;
