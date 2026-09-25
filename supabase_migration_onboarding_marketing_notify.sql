-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Tracks the separate, manual "hand off to marketing" step (see
-- app/api/onboarding/[id]/handover/notify-marketing/route.ts) — split out
-- from the "Client signed & closed" handover trigger because Lucky runs the
-- campaign himself first and only shares the client folder with Harris /
-- notifies him later, client by client.
alter table onboarding_clients
  add column if not exists marketing_notified_at timestamptz;
