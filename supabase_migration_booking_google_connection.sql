-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- OAuth connection to the real lsgrowthagency.co@gmail.com Google account,
-- used for cold-call meeting bookings (lib/calendar.ts). Separate from
-- lucky_google_connection (which is Lucky's own personal account, used for
-- Docs/Sheets) — these are two different Google identities and must not
-- share a row, or reconnecting one would silently redirect the other
-- feature's writes to the wrong account.
--
-- createBooking previously used a bare service account, which Google
-- explicitly refuses to let add Calendar attendees or send real invites
-- without Domain-Wide Delegation (Workspace-only — confirmed live
-- 2026-09-16: "Service accounts cannot invite attendees without
-- Domain-Wide Delegation of Authority"). Authenticating as the real
-- account via OAuth (same as a human clicking "Add guests" in the Calendar
-- UI) has no such restriction — real invites, real per-meeting Meet links,
-- RSVPs synced back to the calendar.
--
-- Single-row table (id fixed to 'booking-calendar') — there's only ever one connection.
create table booking_google_connection (
  id text primary key default 'booking-calendar',
  google_account_email text,
  encrypted_refresh_token bytea not null,
  connected_at timestamptz not null default now()
);
