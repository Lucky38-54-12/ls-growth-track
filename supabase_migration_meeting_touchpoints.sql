-- Extends calendar_bookings so the calendar-sync cron can also send two extra
-- touchpoint emails per booked meeting (a value email ~1 week out, and a
-- reminder email the morning of the meeting), without ever double-sending.
alter table calendar_bookings
  add column if not exists lead_id text,
  add column if not exists start_iso timestamptz,
  add column if not exists hangout_link text,
  add column if not exists value_email_sent_at timestamptz,
  add column if not exists reminder_email_sent_at timestamptz;
