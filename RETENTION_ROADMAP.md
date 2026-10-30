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
- **Cleaning-client check-in variant** (2026-10-28) — the weekly check-in now
  includes cleaning clients too, with different wording: "did these sign up?"
  / Signed up / Didn't convert / Still deciding, instead of Won (+ $ value) /
  Lost / Still talking. Reuses `job_won_at`/`job_lost_reason` — `job_value`
  just stays null for a cleaning client, no new schema.
- **Ad performance drop → Slack alert** (2026-10-29) — `lib/creativeDemandCheck.ts`
  already caught a week-over-week results drop or cost-per-lead rise every 3
  days per client (and auto-reran the Creative Brain), but never told Lucky
  — this is the actual retention lever he named: hearing about a quiet month
  within days instead of from the client at month-end. Now posts to Slack
  the moment a client gets flagged. Migration
  (`supabase_migration_lq_creative_demand_check.sql`) applied 2026-10-29.
- **Lead-to-job conversion trend check** (2026-10-29) —
  `lib/leadConversionCheck.ts`. Closes a real gap Lucky pointed out: ad
  results/CPL (the check above) can look fine while leads quietly stop
  converting into jobs for other reasons. Compares each client's own
  job-outcome data across two past windows (30-60 days ago vs 60-90 days
  ago, giving leads time to close) and posts to Slack on a genuine
  conversion drop or a 0% rate with enough resolved leads to mean
  something.
- **Onboarding call: recurring check-in cadence** (2026-10-29, other session)
  — a free-text "recurring check-in (every 2 weeks)" field recorded during
  the onboarding call and echoed in the recap email. Confirmed with Lucky:
  "monthly report" just means every second fortnightly call doubles as the
  monthly check-in, shown live off the job report page above — no separate
  report-generator needed.

- **Automation visibility + heartbeat ping** (2026-10-29) — the weekly
  check-in and lead conversion trend check now show up as their own rows on
  `/dashboard/automations` (last run time, status), not just folded into
  daily-maintenance's summary line. Added to `checkCronHeartbeats` with a
  9-day staleness threshold — if either goes quiet, Lucky gets pinged on
  Slack same as the other cron heartbeat alerts, closing the "how do I know
  if everything's running smoothly" question.

- **Weekly all-systems-running digest** (2026-10-29) —
  `lib/systemsHealthDigest.ts`. Lucky said outright he's not going to check
  `/dashboard/automations` himself. Every other alert only fires on a
  problem, which makes silence ambiguous — fine, or the whole cron quietly
  died. This posts to Slack every Monday either way: "all systems running
  smoothly" when clean, or a specific list of what's stale/erroring.

## Shipped (continued)

- **30/60/90/120-day roadmap, onboarding call + recap** (2026-10-30) —
  reframed the old "month one is testing, month two is when it clicks" line
  as an explicit day-30/60/90/120 roadmap in `OnboardingCallCard.tsx` and
  `onboardingCallRecapEmail.ts`, so a quiet day 30 doesn't read as the
  campaign not working — the actual month-2 churn trigger Lucky flagged.
  Committed and deployed.
- **Onboarding call copy fixed to match the real flow** (2026-10-30) — the
  card wrongly implied the contract was signed before this call. Real flow:
  sales call → verbal yes → proposal goes out within 24h (this document IS
  the contract, not a separate one) → onboarding call is where content gets
  handed over and that same document gets signed, trade creative list
  confirmed, recurring check-in locked in.
- **Discovery/sales call script updated** (2026-10-30, `sales_script_versions`
  v14, dashboard → Sales Calls → Master Script) — added, in order: (1) a
  "stack in the free extras" beat right after the price — AI/GEO visibility
  and the review funnel, framed as an exclusive bonus, not a line item; (2)
  "set the runway" in the close — tell the prospect about the onboarding
  call, the no-footage-no-start-date rule, and the 30/60/90/120 timeline
  before locking in the yes; (3) ask for a realistic content turnaround
  estimate on the call itself, which becomes the proposal's Campaign Start
  Date; (4) explicit note that the proposal and the contract are one
  document, signed on the onboarding call, not the sales call.
  **Caveat:** the AI/GEO-visibility bonus promised in the script isn't an
  automated system like the review funnel — it's a manual deliverable Lucky
  has to actually go do per client after close. Not yet scoped or built.
- **Builders creative-ask list tightened** (2026-10-30,
  `lib/creativeAskExamples.ts`) — swapped drone shots (rarely in hand) for
  completed-project photos/video and a short to-camera intro clip.

## Not started

- **Fortnightly client check-in cadence itself** — Lucky's own process
  change (meeting every 2 weeks per client, agreed during onboarding). Not
  a code task — the job report page exists to support it.
- **"Not enough value just with ads"** — a service-scope decision (whether
  to bundle something beyond ads), not a build task.
- **AI/GEO visibility deliverable** — now promised on every sales call (see
  above) but there's no actual process or tooling yet for what "getting
  recommended by ChatGPT/AI Overviews" means per client or how it gets
  delivered. Needs scoping before it's promised on many more calls.
