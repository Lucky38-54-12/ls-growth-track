-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Lucky's own Google OAuth connection, used for creating campaign-brief /
-- call-prep / agreement Google Docs (and sales-calls / lead-sheet backups)
-- as his real account instead of the bare service account.
--
-- Service accounts have zero Drive storage quota with no domain-wide
-- delegation (no Google Workspace here, just a personal Gmail), so
-- docs.documents.create()/sheets.spreadsheets.create() always fail with a
-- generic "The caller does not have permission" 403 — the write is charged
-- against the file's *creator*, not whichever folder it's placed in, so
-- moving the file into a shared folder afterwards never helped either.
-- OAuth as Lucky himself means files are created under his real account
-- with his real storage quota from the start.
--
-- Single-row table (id fixed to 'lucky') — there's only ever one connection.
create table lucky_google_connection (
  id text primary key default 'lucky',
  google_account_email text,
  encrypted_refresh_token bytea not null,
  connected_at timestamptz not null default now()
);
