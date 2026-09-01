-- Client Brain: persistent ground-truth about the client itself, separate
-- from the reasoning framework (the system prompt) and from performance
-- memory (ad_learnings). One row per client, jsonb per section so it can
-- grow without more migrations. Authoritative unless explicitly updated —
-- never invented by the model, only read.
create table client_brain (
  client_id uuid primary key references lq_clients(id) on delete cascade,
  business jsonb not null default '{}'::jsonb,
  customer jsonb not null default '{}'::jsonb,
  offer jsonb not null default '{}'::jsonb,
  proof jsonb not null default '{}'::jsonb,
  market jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Hypothesis Memory: persistent, falsifiable strategic hypotheses tracked
-- across runs (distinct from ad_learnings, which is per-creative evidence).
create table creative_hypotheses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references lq_clients(id) on delete cascade,
  question text,
  claim text not null,
  variable_tested text check (variable_tested in ('angle', 'offer', 'persona', 'format', 'execution')),
  evidence_supporting jsonb not null default '[]'::jsonb,
  evidence_against jsonb not null default '[]'::jsonb,
  tests_run jsonb not null default '[]'::jsonb,
  current_confidence text check (current_confidence in ('early_signal', 'promising', 'strong_evidence', 'proven')),
  status text not null default 'active' check (status in ('active', 'supported', 'weakened', 'rejected', 'inconclusive')),
  next_test text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists creative_hypotheses_client_idx on creative_hypotheses(client_id, status);

-- Decision History: every meaningful strategic decision the Brain made,
-- so future runs review what was already decided instead of re-litigating.
create table brain_decisions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references lq_clients(id) on delete cascade,
  decision text not null,
  reasoning text,
  evidence jsonb not null default '[]'::jsonb,
  hypothesis text,
  confidence text check (confidence in ('high', 'medium', 'low')),
  action_taken text,
  outcome text,
  lesson text,
  created_at timestamptz not null default now()
);
create index if not exists brain_decisions_client_idx on brain_decisions(client_id, created_at desc);

-- Strategic State: the Brain's current one-row-per-client summary view,
-- upserted after every analysis run so it can be read instantly without
-- re-running a full analysis.
create table client_strategic_state (
  client_id uuid primary key references lq_clients(id) on delete cascade,
  primary_bottleneck text,
  secondary_bottlenecks jsonb not null default '[]'::jsonb,
  strongest_proven_mechanism text,
  strongest_current_concept text,
  largest_portfolio_risk text,
  largest_testing_gap text,
  active_hypotheses jsonb not null default '[]'::jsonb,
  current_strategic_priority text,
  recommended_action text,
  confidence text check (confidence in ('high', 'medium', 'low')),
  what_would_change_the_decision text,
  updated_at timestamptz not null default now()
);
