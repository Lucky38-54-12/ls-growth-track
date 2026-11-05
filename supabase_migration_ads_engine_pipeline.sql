-- Run this once in Supabase Dashboard → SQL Editor → New query → Run
-- Run AFTER supabase_migration_creative_builder_combo_script.sql.
-- Full ads-engine pipeline: Research (01, reuses the existing
-- ad_research_cache table the Ad Research tool already writes to) ->
-- Ideation (02, already existed) -> Briefs/scripts (03, already migrated)
-- -> Design brief (04) -> render queue (05) -> Meta launch (06, always
-- created PAUSED) -> tracking feedback (07).

-- Stage 04/05/06 fields on the combo (the spine object that flows through
-- every stage).
alter table creative_builder_combos add column if not exists design_brief jsonb;
alter table creative_builder_combos add column if not exists video_status text not null default 'none';
alter table creative_builder_combos add column if not exists video_url text;
alter table creative_builder_combos add column if not exists launch_status text not null default 'none';
alter table creative_builder_combos add column if not exists meta_ad_id text;
alter table creative_builder_combos add column if not exists meta_ad_set_id text;
alter table creative_builder_combos add column if not exists launched_at timestamptz;

alter table creative_builder_combos drop constraint if exists creative_builder_combos_video_status_check;
alter table creative_builder_combos add constraint creative_builder_combos_video_status_check
  check (video_status in ('none', 'queued', 'rendering', 'ready'));

alter table creative_builder_combos drop constraint if exists creative_builder_combos_launch_status_check;
alter table creative_builder_combos add constraint creative_builder_combos_launch_status_check
  check (launch_status in ('none', 'pending', 'launched'));

-- Stage 06: the Facebook Page an ad gets created as (required by the
-- Marketing API for ad creatives, distinct from the ad account id already
-- stored on this table).
alter table lq_clients add column if not exists meta_page_id text;

-- Stage 05: render handoff. HyperFrames only runs as a Claude Code skill,
-- not inside Vercel's serverless runtime, so this is a queue an agent
-- session drains, not a cron job.
create table if not exists ad_render_queue (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references creative_builder_combos(id) on delete cascade,
  status text not null default 'queued',
  video_url text,
  error text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table ad_render_queue drop constraint if exists ad_render_queue_status_check;
alter table ad_render_queue add constraint ad_render_queue_status_check
  check (status in ('queued', 'processing', 'done', 'failed'));
create index if not exists ad_render_queue_combo_id_idx on ad_render_queue (combo_id);
