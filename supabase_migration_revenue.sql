-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Tracks paying clients and their monthly payment, so the dashboard can show
-- live progress toward the monthly recurring revenue goal.
create table if not exists revenue_clients (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  amount numeric not null,
  added_at timestamptz not null default now()
);

-- Single-row table holding the current monthly revenue goal.
create table if not exists revenue_goal (
  id int primary key default 1,
  monthly_goal numeric not null default 3000,
  constraint revenue_goal_singleton check (id = 1)
);

insert into revenue_goal (id, monthly_goal)
values (1, 3000)
on conflict (id) do nothing;
