-- Run this once in Supabase Dashboard → SQL Editor → New query → Run
-- Adds the phone column needed for the auto-prospector / call queue.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS phone text;
