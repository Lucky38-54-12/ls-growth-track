-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Real Meta Ad Library results, pulled by hand (via an authenticated browser
-- session — Meta's Ad Library API doesn't cover NZ/AU commercial ads, and the
-- public site's real ad data sits behind a logged-in GraphQL call we don't
-- run unattended). The Ad Research page checks this cache first and only
-- falls back to the AI web-search summary when a niche+location hasn't been
-- researched yet.
create table if not exists ad_research_cache (
  id uuid default gen_random_uuid() primary key,
  niche_key text not null,
  location_key text not null,
  summary text not null,
  ads jsonb not null,
  researched_at timestamptz not null default now()
);

create unique index if not exists idx_ad_research_cache_key on ad_research_cache (niche_key, location_key);
