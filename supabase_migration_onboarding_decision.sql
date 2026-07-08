-- Splits onboarding into two buckets: clients ready to move forward (full
-- checklist + intake) vs clients still deciding (lightweight tracking with
-- a follow-up date instead of the full checklist). Existing rows default to
-- 'ready' since they're already mid-checklist.
ALTER TABLE onboarding_clients
  ADD COLUMN IF NOT EXISTS decision_status text NOT NULL DEFAULT 'ready'
    CHECK (decision_status IN ('ready', 'thinking')),
  ADD COLUMN IF NOT EXISTS follow_up_at date,
  ADD COLUMN IF NOT EXISTS services text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ads_manager_added boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ad_budget text,
  ADD COLUMN IF NOT EXISTS creatives_needed text;
