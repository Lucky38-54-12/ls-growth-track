-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Registers the three 15-min-cadence crons that run on cron-job.org (not
-- GitHub Actions or Vercel cron — see CLAUDE.md) so they can self-report a
-- heartbeat here, the same way daily-maintenance already does. Without a row
-- to update, reportAutomationStatus's .update().eq("slug", ...) is a no-op,
-- so these need to exist before the routes' reportAutomationStatus calls do
-- anything. daily-maintenance's new watchdog step reads last_run_at off
-- these three to detect a silently-stalled cron (e.g. cron-job.org pausing
-- the job, or CRON_SECRET drifting out of sync) instead of relying on
-- someone noticing missed reminder emails.
insert into automations (slug, name, description, schedule_label, kind, external_url)
values
  (
    'calendar-sync',
    'Calendar Sync & Meeting Reminders',
    'Picks up new Google Calendar bookings and sends the day-before / 3-hours-before meeting reminder emails.',
    'Every 15 min (cron-job.org)',
    'cron',
    null
  ),
  (
    'lead-qual-callback-reminders',
    'Lead-Qual Callback Reminders',
    'Sends the day-before / 3-hours-before reminder emails to leads with a booked AI lead-qual callback.',
    'Every 15 min (cron-job.org)',
    'cron',
    null
  ),
  (
    'check-personal-inbox',
    'Personal Inbox Check',
    'Checks Lucky''s personal Gmail inbox for replies that need routing/handling.',
    'Every 15 min (cron-job.org)',
    'cron',
    null
  )
on conflict (slug) do nothing;
