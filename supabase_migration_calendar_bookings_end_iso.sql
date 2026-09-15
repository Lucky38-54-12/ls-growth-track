-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Needed to build a correct .ics calendar invite (DTEND) for meeting
-- reminder emails — see lib/ics.ts / sendMeetingTouchpoints in
-- lib/calendarSync.ts. Existing rows have no end time recorded; reminders
-- for bookings synced before this migration fall back to start + 30 min in
-- code until they're naturally replaced by newly-synced bookings.
alter table calendar_bookings add column if not exists end_iso timestamptz;
