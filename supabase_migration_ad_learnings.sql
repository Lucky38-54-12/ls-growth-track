-- Persistent ad-performance learnings for the Brain's Lead Generation
-- Intelligence System (see lib/brainContext.ts AD_INTELLIGENCE_PROMPT) —
-- distinct from brain_learnings, which stores Lucky's own decision
-- preferences, not campaign performance patterns. Each row is one durable,
-- Observed/Inference/Next-Test pattern about what's working for a client,
-- written only after Lucky approves it via the normal chat_drafts queue
-- (kind "ad_learning") — never inserted directly by the model.
create table ad_learnings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references lq_clients(id) on delete cascade,
  service text,
  angle text,
  creative text,
  offer text,
  observed text not null,
  inference text,
  next_test text,
  confidence text not null default 'early_signal' check (confidence in ('early_signal', 'promising', 'strong_evidence', 'proven')),
  created_at timestamptz not null default now()
);

create index if not exists ad_learnings_client_idx on ad_learnings(client_id, created_at desc);
