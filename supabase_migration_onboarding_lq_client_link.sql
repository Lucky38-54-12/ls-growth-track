-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

alter table onboarding_clients
  add column if not exists lq_client_id uuid references lq_clients(id);
