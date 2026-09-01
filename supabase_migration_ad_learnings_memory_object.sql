-- Creative Brain V2 memory-object fields (Lucky's own spec, 2026-09-01,
-- section 40 "Memory Object"). `belief_status` is deliberately separate from
-- the existing `status` column: `status` tracks a creative's TEST lifecycle
-- (untested/testing/winner/loser/...), `belief_status` tracks the LEARNING's
-- own confidence lifecycle (a belief can be superseded/confirmed/rejected by
-- later evidence without the underlying creative's test status changing).
alter table ad_learnings
  add column if not exists learning_type text check (learning_type in ('creative', 'offer', 'persona', 'angle', 'hook', 'format', 'portfolio', 'funnel', 'market')),
  add column if not exists situation text,
  add column if not exists desire text,
  add column if not exists awareness_stage text,
  add column if not exists pain_or_desire text check (pain_or_desire in ('pain', 'desire', 'mixed')),
  add column if not exists what_this_proves text,
  add column if not exists what_this_does_not_prove text,
  add column if not exists related_concepts jsonb,
  add column if not exists tests_completed jsonb,
  add column if not exists decision_made text,
  add column if not exists outcome text,
  add column if not exists belief_status text not null default 'active' check (belief_status in ('active', 'inconclusive', 'superseded', 'confirmed', 'rejected')),
  add column if not exists updated_at timestamptz not null default now();
