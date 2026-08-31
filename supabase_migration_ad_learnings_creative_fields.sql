-- Extends ad_learnings with the fields the Creative Strategy AI framework
-- needs for a real recommendation (hook/format/headline/primary text/CTA/
-- visual direction), not just the original observed/inference/next_test
-- shorthand. `priority` is testing priority for a brand-new recommendation
-- (how urgent to test it), distinct from `confidence` (how strong the
-- evidence is behind an already-observed pattern) — a fresh hypothesis has
-- a priority but no confidence yet since nothing has run.
alter table ad_learnings
  add column if not exists segment text,
  add column if not exists hook text,
  add column if not exists format text,
  add column if not exists headline text,
  add column if not exists primary_text text,
  add column if not exists cta text,
  add column if not exists visual_direction text,
  add column if not exists hypothesis text,
  add column if not exists priority text check (priority in ('high', 'medium', 'low')),
  add column if not exists priority_reason text,
  add column if not exists status text not null default 'untested' check (status in ('untested', 'testing', 'winner', 'loser', 'needs_more_data', 'iteration_opportunity', 'retired'));
