-- Registers the two weekly retention checks (lib/weeklyCheckin.ts,
-- lib/leadConversionCheck.ts) as their own rows on /dashboard/automations,
-- instead of only showing up folded into daily-maintenance's overall
-- summary line. last_run_at is seeded to now() so checkCronHeartbeats'
-- 9-day staleness threshold doesn't fire a false alarm before these have
-- had their first real Monday run.
insert into automations (slug, name, description, schedule_label, kind, last_run_at, last_status, last_summary)
values
  (
    'weekly-checkin',
    'Weekly Job-Outcome Check-in',
    'Every Monday, emails each active client any lead with no outcome logged yet (won/lost/signed-up) with a tap-through link.',
    'Weekly (Monday)',
    'routine',
    now(),
    'ok',
    'Registered — awaiting first scheduled run'
  ),
  (
    'lead-conversion-trend-check',
    'Lead Conversion Trend Check',
    'Every Monday, flags any client whose lead-to-job conversion rate has genuinely dropped, independent of ad-platform results.',
    'Weekly (Monday)',
    'routine',
    now(),
    'ok',
    'Registered — awaiting first scheduled run'
  )
on conflict (slug) do nothing;
