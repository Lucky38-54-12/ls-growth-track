-- Backfills the automations row for sync-lead-sheets so the watchdog cron
-- (app/api/cron/watchdog/route.ts, lib/automationStatus.ts) can monitor it
-- for staleness. Before this, the cron-job.org job disabled itself during
-- the 2026-10-31 Vercel Fluid Active CPU overage pause and nothing alerted
-- for 3 days because this job had no heartbeat at all.
insert into automations (slug, name, description, schedule_label, kind, external_url, enabled, last_run_at, last_status, last_summary)
values (
  'sync-lead-sheets',
  'Client Lead Sheets Sync',
  'Pulls new Meta Lead Ads leads into each client''s "All Leads" Google Sheet tab and sends booking/review-funnel follow-ups.',
  'Every 15 min (cron-job.org)',
  'cron',
  null,
  true,
  now(),
  'ok',
  'Backfilled row — watchdog monitoring added 2026-11-03.'
)
on conflict (slug) do nothing;
