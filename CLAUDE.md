# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Next.js 14 (App Router) app deployed to Vercel as `ls-growth-track`, live at `app.lsgrowth.agency`. It's Lucky's internal dashboard for running LS Growth's outreach/agency business: cold-call lead pipeline, email campaigns, AI lead qualification (Facebook/Meta lead ads + website chat), sales call tracking, client portal, and a growing "Brain" assistant surface. No Tailwind — use inline styles for anything visual.

## Commands

```
npm run dev      # next dev -p 3005
npm run build    # next build
npm start        # next start -p 3005
npx vercel dev   # local testing of serverless functions (per README)
```

There is no test suite and no lint script configured. `tsconfig.tsbuildinfo` is committed (incremental build cache) — don't worry about it.

## Architecture

**Route structure**: `app/api/**` holds all backend logic as Next.js route handlers; `app/dashboard/**` is the internal (session-cookie-gated) admin UI; `app/portal/**` is a completely separate client-facing surface with its own login/cookie; `app/connect/[clientId]` is an unauthenticated one-off flow for a client to link their own Google/Facebook account.

**Auth is cookie-based and enforced centrally in `middleware.ts`**, not per-route:
- Internal dashboard: `ls_growth_session` cookie, HMAC-signed via `lib/session.ts` (Edge-compatible, no Node `Buffer`/crypto — uses Web Crypto so it runs in middleware).
- Client portal (`/portal/**`, `/api/portal/**`): entirely separate `lq_client` cookie/auth (`lib/leadQual/clientAuth.ts`), independent of the admin session.
- `/portal/onboarding/[token]` is a third, unrelated flow — a client confirming onboarding details post-sale, authenticated by the token in the URL (`lib/onboardingPortalAuth.ts`), not by any cookie.
- Cron routes (`/api/cron/**` plus a few `/api/admin/*`) are public in middleware but self-gate on a `CRON_SECRET` bearer token checked inside the route handler.
- When adding a new route that should be public (webhooks, tracking pixels, etc.), it must be added to `PUBLIC_PATHS` (or `PORTAL_PUBLIC_PATHS`) in `middleware.ts` or it will redirect to `/login`/`/portal/login`.

**Data layer**: Supabase, project `rnshdhqjipmgbkjhvczs` ("LS Growth"). No ORM — plain `@supabase/supabase-js` calls via `createSupabaseClient()` in `lib/supabase.ts`. Two things to know before writing a new query:
- Fetch is forced to `cache: "no-store"` in the client itself, because Next.js on Vercel otherwise caches/dedupes `fetch` globally and would serve stale Supabase reads.
- Supabase caps a plain `select` at 1000 rows. Any table that can exceed that (leads, in particular) must be read via `fetchAllRows()` (same file), which pages with `.range()`. Don't write a raw unpaginated `select` against a growing table.
- Schema changes are plain SQL files at the repo root (`supabase_migration_*.sql`), applied by hand in the Supabase SQL editor — there's no migration runner. `SUPABASE.sql` is the base schema dump. Name new migration files following the existing `supabase_migration_<feature>.sql` convention and match them to the feature they belong to.

**Cron / background jobs run on three schedulers, not one**:
- `vercel.json` only defines `/api/cron/daily-maintenance` (Vercel's free plan caps a project at 2 cron jobs).
- `.github/workflows/cron.yml` (GitHub Actions) drives the once/twice-daily jobs (morning-brief, daily-maintenance backup trigger, lead-qual-sync), curling the deployed routes with `Authorization: Bearer $CRON_SECRET`. It's tolerant of GitHub's scheduling jitter by checking wall-clock time in a wide window rather than trusting `event.schedule`.
- The three time-sensitive 15-min-cadence jobs (`calendar-sync`, `lead-qual-callback-reminders`, `check-personal-inbox`) run on **cron-job.org** instead, hitting the same bearer-protected routes every 15 minutes — GitHub Actions was confirmed (2026-09-14) to leave multi-hour dead spots on sub-hourly schedules, which silently skipped both reminder emails for a booked meeting. If a day-before/3-hours-before reminder isn't firing, check the cron-job.org job history before assuming the app logic is broken.
- `/api/cron/daily-maintenance` itself fans out into ~10 independent jobs (reply checking, sheet sync, calendar sync, email learning, lead-qual nurture, stale-reply escalation, cold-call nudges, no-show follow-ups, weekly digest, Messenger channel health, automation status reporting) each wrapped in its own try/catch so one failing job doesn't block the rest. It also self-dedupes against same-day re-runs via an `automations` table row keyed by slug, checked in NZT — needed because the GitHub Actions trigger window is intentionally wide and can double-fire.
- Before adding new scheduled work, check whether it belongs inside `daily-maintenance` (if daily and cheap) vs. a new GitHub Actions cron entry (if it needs its own cadence) — don't assume you can just add a new Vercel cron slot, there are none free.
- Some daily-maintenance sub-jobs (sheetSync, coldCallNudges, proposalFollowup, noShowSequence) burned heavy API spend in the past and are currently gated — check before re-enabling anything that looks disabled.

**`lib/leadQual/`** is the AI lead-qualification subsystem (Facebook Lead Ads + website chat → auto-qualify → book callback), used by both the dashboard (`app/dashboard/lead-qual/`) and public webhook/chat endpoints (`app/api/lead-qual/**`). It has its own dedupe, Facebook OAuth, Google Calendar booking, and conversation-state logic — read `conversationManager.ts` and `qualification.ts` first if touching this area, since conversation state and human-takeover state are easy to get out of sync (there's a history of the human-takeover check "going blind" after a conversation row resets — see git log).

**AI usage**: Anthropic SDK (`lib/ai.ts`, `lib/anthropicUsage.ts` for spend tracking) is used throughout for email generation, lead qualification, sales call analysis, campaign briefs, and the "Brain"/"creative brain" assistant features (`lib/brainContext.ts`, `lib/creativeBrain.ts`, `lib/performanceBrain.ts`, etc.) — this is a recurring architectural pattern in the app: a `*Brain` lib module holding an AI feature's context-building + prompt logic, paired with a route under `app/api/*-brain*` and a UI page under `app/dashboard/*`.

**Email**: bulk/automated outreach and campaign sequences go through Resend (`outreach@lsgrowth.agency`, verified domain) — not Gmail SMTP, which was flagged as a spam-ban risk at that volume. Manual/conversational sends (meeting reminders, inbox replies) still go through Gmail (`lib/gmail.ts`) so they show up in Lucky's real Sent folder. Replies to bulk sends route back to his Gmail inbox via `Reply-To`.

**Writing in Lucky's voice**: `writing-style.md` at the repo root defines the tone for anything sent to leads/clients (cold emails, follow-ups, recaps) — read it before drafting outbound copy and check drafts against it. `outreach-learnings.md` is a running log of what's already been A/B tested; check it before proposing a new test so you don't re-run something already logged (and don't trust a result based on fewer than ~15-20 data points).
