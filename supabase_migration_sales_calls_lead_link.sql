-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

alter table sales_calls
  add column if not exists lead_id text references leads(lead_id);
