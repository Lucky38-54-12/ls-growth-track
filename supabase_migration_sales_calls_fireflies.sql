-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

alter table sales_calls
  add column if not exists fireflies_meeting_id text unique;
