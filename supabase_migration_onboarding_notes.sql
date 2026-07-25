-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

create table if not exists onboarding_notes (
  id uuid primary key default gen_random_uuid(),
  note text not null,
  created_at timestamptz not null default now()
);
