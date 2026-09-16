-- The reminder emails' .ics invite was built with a made-up UID
-- (`${eventId}@lsgrowth.agency`) instead of the real event's iCalUID, so a
-- lead clicking Yes/No on our own emailed invite likely never actually
-- wrote the RSVP back to the real Google Calendar event — only Google's own
-- separately-sent native invite email (which uses the real iCalUID) did.
-- Storing the real iCalUID lets every invite we build reference the actual
-- event so RSVPs from our own email round-trip correctly.
alter table calendar_bookings add column if not exists ical_uid text;
