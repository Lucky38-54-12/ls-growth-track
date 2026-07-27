-- The actual appointment/callback instant a booking landed on — distinct
-- from booked_at, which is when the booking transaction happened (i.e. when
-- the AI chat closed), not the job's scheduled time. The portal calendar and
-- leads list need the real appointment time, which previously only lived
-- inside the Google Calendar event itself. Applied directly to the live
-- project.
alter table lq_leads add column if not exists scheduled_at timestamptz;
