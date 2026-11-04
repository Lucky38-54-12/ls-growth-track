-- Backfills the automations row for lead-qual-sync. The route was running
-- fine (twice daily via .github/workflows/cron.yml) but never called
-- reportAutomationStatus, so the watchdog (lib/automationStatus.ts) treated
-- it as permanently stale and Slack-alerted every 15 min even while it was
-- healthy. app/api/cron/lead-qual-sync/route.ts now reports a heartbeat.
insert into automations (slug, name, description, schedule_label, kind, external_url, enabled, last_run_at, last_status, last_summary)
values (
  'lead-qual-sync',
  'Lead-Qual Facebook Backfill Sync',
  'Twice-daily safety net that re-checks every client''s Facebook Lead Ad history for leads the live webhook missed.',
  '6am & 12pm NZT (GitHub Actions)',
  'cron',
  null,
  true,
  now(),
  'ok',
  'Backfilled row — was running fine but never reported a heartbeat, so watchdog falsely flagged it as stale every cycle.'
)
on conflict (slug) do nothing;
