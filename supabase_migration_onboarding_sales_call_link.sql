-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

alter table onboarding_clients
  add column if not exists sales_call_id uuid references sales_calls(id);
