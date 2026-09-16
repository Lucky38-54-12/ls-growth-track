-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql
--
-- Calendar is the ground truth for what's booked (see CLAUDE.md), but there
-- was no way to tell a genuine no-show apart from Fireflies simply failing
-- to log the call — leads.status doesn't track it and calendar_bookings only
-- covers events the sync pipeline recognized as a lead booking. This is a
-- standalone table keyed by the raw Google Calendar event_id so it works for
-- any meeting on the calendar, marked by hand from the Calendar page.

create table if not exists meeting_outcomes (
  event_id text primary key,
  show_status text not null check (show_status in ('showed', 'no_show', 'rescheduled')),
  marked_at timestamptz not null default now()
);
