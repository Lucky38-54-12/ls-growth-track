-- sendMeetingTouchpoints had no way to know a booking's Google Calendar event
-- had been cancelled, so the day-before/3-hour-before reminder emails (and
-- SMS) kept going out to leads who had already cancelled the meeting.
-- cancelled_at is set once the live event is confirmed cancelled/deleted, so
-- the reminder loop can skip it without re-checking the Calendar API every run.
alter table calendar_bookings add column if not exists cancelled_at timestamptz;
