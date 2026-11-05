-- Run this once in Supabase Dashboard → SQL Editor → New query → Run
-- Throttle column for the new autopilot cycle (lib/adsEngineAutopilot.ts) —
-- weekly per client, same pattern as creativeDemandCheck's
-- last_creative_demand_check_at.
alter table lq_clients add column if not exists last_autopilot_cycle_at timestamptz;

-- Public bucket for finished HyperFrames renders — Meta's /advideos upload
-- (lib/metaAdsLaunch.ts) needs a plain, unauthenticated, directly-fetchable
-- URL for file_url, which a Drive share link or a signed Supabase URL
-- doesn't reliably give. The scheduled render-queue routine (agent session
-- with HyperFrames skills, can't run inside this app) uploads here.
insert into storage.buckets (id, name, public)
values ('ad-render-videos', 'ad-render-videos', true)
on conflict (id) do nothing;
