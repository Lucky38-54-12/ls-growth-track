-- Run this once in Supabase Dashboard → SQL Editor → New query → Run
-- Phase 2 of the ads engine automation: lets a saved creative_builder_combos
-- row carry an AI-drafted VO script, held for Lucky's approval before any
-- rendering happens (script-first, per his rule — never jump straight to
-- production).

alter table creative_builder_combos add column if not exists script text;
alter table creative_builder_combos add column if not exists script_status text not null default 'none';
alter table creative_builder_combos add column if not exists script_drafted_at timestamptz;

alter table creative_builder_combos drop constraint if exists creative_builder_combos_script_status_check;
alter table creative_builder_combos add constraint creative_builder_combos_script_status_check
  check (script_status in ('none', 'drafted', 'approved'));
