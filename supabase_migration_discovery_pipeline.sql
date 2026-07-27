-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

alter table leads
  add column if not exists post_call_outcome text check (post_call_outcome in ('hot','warm','closed_won')),
  add column if not exists post_call_stage text check (post_call_stage in ('active','paused','cold_again','onboarding')),
  add column if not exists main_objection text,
  add column if not exists sales_call_done_at timestamptz,
  add column if not exists touchpoint_index int not null default 0,
  add column if not exists last_touchpoint_at timestamptz,
  add column if not exists next_touchpoint_at date,
  add column if not exists agreement_sent boolean not null default false,
  add column if not exists ads_manager_access boolean not null default false,
  add column if not exists agreement_signed boolean not null default false,
  add column if not exists campaign_live boolean not null default false;
