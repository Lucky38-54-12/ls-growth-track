# Client Retention Roadmap

Tracks everything shipped against the month-2 churn problem Lucky raised
2026-10-28: clients leaving around month 2 because leads weren't reliably
tracked through to a closed job, no expectations were set at the start,
and there was no system keeping him in the loop without manual chasing.
Both this file's history and git log are the source of truth — update
this when something ships or scope changes, don't let it drift from
what's actually live.

## Problems identified (2026-10-28)

1. Lead → job outcome tracking — couldn't tell which leads became paying jobs
2. Onboarding / expectations-setting — only a sales call, nothing written down
3. Staying in the loop through month 1–2 without manual chasing
4. Client-visible proof of value (leads delivered vs. jobs won)
5. Cleaning clients churn too, but don't fit a "discrete job" model

## Shipped

- **Weekly job-outcome check-in** (2026-10-28) — `lib/weeklyCheckin.ts`. Every
  Monday, one email per active builder client listing any lead with no
  outcome logged yet. No-login tap-through page (`/portal/checkin/[token]`,
  `lib/checkinPortalAuth.ts`) — Won (asks ballpark $) / Lost / Still talking.
  Writes to new `lq_leads` columns: `job_value`, `job_won_at`,
  `job_lost_reason` (migration `supabase_migration_lq_leads_job_outcome.sql`).
  Scoped to builder-trade clients only — cleaning clients get ongoing
  contracts, not discrete priced jobs, so this doesn't fit them (problem #5
  still open for cleaning).
- **Sheet cross-check** (2026-10-28) — `getLeadStatusesByLeadId()` in
  `lib/metaLeadsSheetSync.ts`. Matches a lead to its row on the client's own
  Meta Lead Ads call sheet by `leadgen_id`. Only includes it in the weekly
  check-in once `Called?` is ticked AND `Outcome` is blank — skips anything
  not yet contacted, and anything already logged with an Outcome.
- **Client roster cleanup** (2026-10-28) — marked BG Builds, Buildit All,
  Canterbury Coat, Eddy's Construction, Katie's Elite Cleaning, Kris, and
  Precision Built Ltd `paused` in `lq_clients` (not actually being worked
  with anymore).
- **Per-client job report page** (2026-10-28) —
  `/dashboard/lead-qual/[id]/report`. Leads / jobs won / jobs lost / total
  value / awaiting-outcome, with a 30-day / 90-day / all-time toggle — built
  for Lucky to pull up live during the fortnightly client check-in, not an
  automated report.
- **Production build fix** (2026-10-28, unrelated but blocking) — committed
  the missing `lib/creativeDemandCheck.ts` + its migration
  (`supabase_migration_lq_creative_demand_check.sql`); every deploy had been
  silently failing for a while before this.

## In progress

- **Onboarding / expectations-setting** — separate Claude Code session,
  started 2026-10-28. Post-close kickoff that sets month-1/month-2
  expectations in writing, replacing the bare sales-call handoff. Touching
  `lib/onboardingSteps.ts`, `components/onboarding/*`,
  `lib/onboardingKickoffEmail.ts`, `lib/onboardingCallRecapEmail.ts`.

## Not started

- **Fortnightly client check-in cadence** — Lucky's own process change
  (meeting every 2 weeks per client), not a code task. The job report page
  above is meant to support it, not replace it.
- **Cleaning-client version of job tracking** — needs its own shape (e.g.
  "signed up" vs. "didn't convert" rather than job value) since cleaning
  leads become ongoing contracts, not one-off priced jobs.
- **"Not enough value just with ads"** — a service-scope decision (whether
  to bundle something beyond ads), not a build task.
