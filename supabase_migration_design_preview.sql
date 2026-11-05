-- Run this once in Supabase Dashboard → SQL Editor → New query → Run
-- Run AFTER supabase_migration_ads_engine_pipeline.sql,
-- supabase_migration_creative_builder_combo_script.sql and
-- supabase_migration_ads_engine_autopilot.sql (all already applied).

-- Stage 04.5: static-visual preview, built with the claude.ai "Design"
-- Artifact canvas, sitting between the copy-only design brief (04) and the
-- HyperFrames render queue (05). Lucky reviews/approves the look here
-- before it gets pulled into HyperFrames as the starting visual via the
-- HyperFrames MCP's import-claude-design-from-url.
alter table creative_builder_combos add column if not exists design_preview_url text;
alter table creative_builder_combos add column if not exists design_preview_status text not null default 'none';

alter table creative_builder_combos drop constraint if exists creative_builder_combos_design_preview_status_check;
alter table creative_builder_combos add constraint creative_builder_combos_design_preview_status_check
  check (design_preview_status in ('none', 'queued', 'drafted', 'approved'));

-- Same "agent drains a queue" shape as ad_render_queue, since building the
-- Design artifact needs an agent session (the Artifact tool), not something
-- a Vercel serverless function can call directly.
create table if not exists ad_design_preview_queue (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references creative_builder_combos(id) on delete cascade,
  status text not null default 'queued',
  preview_url text,
  error text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table ad_design_preview_queue drop constraint if exists ad_design_preview_queue_status_check;
alter table ad_design_preview_queue add constraint ad_design_preview_queue_status_check
  check (status in ('queued', 'processing', 'done', 'failed'));
create index if not exists ad_design_preview_queue_combo_id_idx on ad_design_preview_queue (combo_id);

-- Carried onto the render queue row so the agent draining ad_render_queue
-- has the approved preview URL on hand to feed into the HyperFrames build.
alter table ad_render_queue add column if not exists design_preview_url text;
