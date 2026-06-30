create table if not exists onboarding_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text not null,
  email text,
  phone text,
  completed_steps text[] default '{}',
  notes text default '',
  created_at timestamptz default now()
);
