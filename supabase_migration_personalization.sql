-- Run this once in Supabase Dashboard → SQL Editor → New query → Run
-- Adds the fields needed for research-driven email personalization.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS facebook text,
  ADD COLUMN IF NOT EXISTS personalization_hook text;
