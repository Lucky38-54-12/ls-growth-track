-- Lets sendMeetingTouchpoints remind attendees (and Slack-notify Lucky) on
-- bookings that never matched a lead — previously those rows only stored
-- event_id/lead_id/start_iso/hangout_link, so a booking with lead_id null
-- (title didn't match the "meet/call with X" pattern) had no attendee info
-- to send a reminder to and got silently skipped forever.
alter table calendar_bookings
  add column if not exists attendee_email text,
  add column if not exists attendee_name text,
  add column if not exists summary text;
