-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql
-- Real payment due-date tracking for lq_clients (the active-client roster —
-- NOT onboarding_clients, which only tracks in-progress onboarding rows).
-- Replaces the old "assume every client pays 30 days after
-- onboarding_clients.campaign_start_date, forever" logic in
-- lib/paymentReminders.ts (which never recorded whether a cycle was paid).

alter table lq_clients
  add column if not exists monthly_fee numeric,
  add column if not exists billing_cycle_days integer not null default 30,
  add column if not exists next_payment_due_date date,
  add column if not exists last_paid_at date;
