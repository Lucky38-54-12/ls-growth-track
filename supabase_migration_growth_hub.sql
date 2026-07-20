-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Content ideas for LinkedIn posts, shown on the Growth Hub content calendar.
create table if not exists content_ideas (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  notes text,
  post_date date,
  status text not null default 'idea' check (status in ('idea', 'scheduled', 'posted')),
  created_at timestamptz not null default now()
);

create index if not exists idx_content_ideas_post_date on content_ideas (post_date);
create index if not exists idx_content_ideas_status on content_ideas (status);

-- Apollo-sourced prospects to work down and connect with on LinkedIn.
create table if not exists prospects (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  company text,
  industry text,
  linkedin_url text,
  connected boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_prospects_connected on prospects (connected);
