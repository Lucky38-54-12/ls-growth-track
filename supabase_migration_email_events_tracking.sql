-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- The open/click tracking routes (/api/open, /api/click) insert user_agent
-- and ip on every event, but those columns were never added to
-- email_events — every insert has been failing with a schema-cache 400,
-- silently swallowed by the routes' empty catch blocks. That's why Open
-- Rate and Click Rate on the dashboard have been stuck at 0%.
alter table email_events add column if not exists user_agent text;
alter table email_events add column if not exists ip text;
