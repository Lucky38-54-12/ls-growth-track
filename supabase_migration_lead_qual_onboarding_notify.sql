-- Tracks whether Lucky's already been emailed that a client finished
-- connecting both Facebook and Calendar, so the notification fires once.
alter table lq_clients add column if not exists onboarding_notified_at timestamptz;
