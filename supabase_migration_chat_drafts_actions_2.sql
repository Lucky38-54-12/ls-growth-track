-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Adds two more Brain action kinds on top of the existing chat_drafts
-- payload pattern (see supabase_migration_chat_drafts_actions.sql):
-- calendar_booking (creates a real Google Calendar event on approval) and
-- sheet_update (writes a row in a tracked cold-call Google Sheet on
-- approval). Same rule as every other kind — nothing executes until
-- Lucky approves it in the /dashboard/brain queue.
alter table chat_drafts drop constraint if exists chat_drafts_kind_check;
alter table chat_drafts add constraint chat_drafts_kind_check check (kind in ('email', 'note', 'lead_update', 'calendar_booking', 'sheet_update'));
