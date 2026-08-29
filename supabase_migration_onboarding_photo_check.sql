-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

alter table onboarding_clients
  add column if not exists photos_file_count integer not null default 0;
