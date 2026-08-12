-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Stores durable, generalizable insights the Brain distills from Lucky's
-- approve/reject decisions on its own proposed drafts (see
-- lib/brainLearnings.ts) — a second, AI-populated source alongside the
-- hand-written agency_brain table, fed into every future Brain call the
-- same way. Reviewable/prunable on /dashboard/agency-brain, same trust
-- model as the sections Lucky edits himself.
create table if not exists brain_learnings (
  id uuid primary key default gen_random_uuid(),
  insight text not null,
  source_kind text,
  decision text check (decision in ('approved', 'rejected')),
  created_at timestamptz not null default now()
);
