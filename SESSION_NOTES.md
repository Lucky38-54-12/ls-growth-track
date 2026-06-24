# LS Growth Dashboard — Session Notes

Summary of changes made to `app.lsgrowth.agency` in this session, so nothing gets lost. All of this is already committed and deployed to production (Vercel) and pushed to GitHub (`Lucky38-54-12/ls-growth-track`, `main` branch).

## Background automation
- Restored daily cron jobs in `vercel.json`: sheet sync (7pm) and calendar sync (9pm).
- The old Resend-based `/api/email/schedule` cron (which auto-emailed leads from a Drive folder with no pipeline awareness) stayed disabled — it's legacy and unsafe.
- Auto email follow-ups via `/api/cron` were turned ON then explicitly turned back OFF at your request — sheet/calendar sync still run daily, but no emails auto-send right now.

## Pipeline / Cold Call Leads page (`/dashboard`)
- Rebuilt as a single drag-and-drop kanban board (`components/PipelineBoard.tsx`) — drag a card between stage columns to update its status, click a card to expand inline details (contact info, notes, "open full record" link).
- Page is now **cold-call leads only** (email-outreach leads have their own pages: Email Outreach, Email Tracking).
- Removed the old behavior of splitting leads into dozens of tiny boards by trade+city — now it's one board, with trade/city segments as clickable filter pills instead (e.g. "Wellington Cleaning Companies (12)").
- Removed the "Sync from Google Sheet" button and other clutter from the action bar.
- Added an **"Import from Inbox"** feature (`/api/leads/from-inbox`) — pulls genuine reply leads (subject starts with "Re:", filtered against a blocklist of SaaS/notification senders) from the last 2 weeks of Gmail into the pipeline as "Contacted".
- Added a **"Find Real Names"** button — batch-processes leads still addressed as "there", trying to extract a real contact name from their actual website text (never invents one).

## Today page (`/dashboard/today`)
- Added a light grey page background + white cards (was missing entirely — also true of several other pages, fixed via a new shared `app/dashboard/layout.tsx`).
- Colorized the 5 stat cards (red/amber/blue/purple/green per metric instead of all red).
- "Pipeline Overview" converted from a stacked list into a single horizontal strip (like "Operational Impact" style).

## Visual design (site-wide, `app/globals.css`)
- Applied the Inter font everywhere (it was loaded via `next/font` but never actually wired to `body` — every page was silently using the browser default font before this).
- Made every corner square (`border-radius: 0 !important` globally) per your request to match the Club HQ reference look.
- Fixed `--red` / `--blue` / `--green` CSS variables — they were referenced everywhere but never defined in any stylesheet.
- The `.card-hover`, `.btn-lift`, `.pill-hover`, `.row-hover`, `.surface-card`, `.stat-card`, `.nav-link-light` classes were referenced throughout the dashboard JSX but **never defined anywhere** — meaning no hover effects existed at all, and some cards had no visible background/border. All now properly defined with real hover states (lift, shadow, color change) and base white-card styling.

## Email sending infrastructure
- **Bulk/automated outreach now goes through Resend** (`outreach@lsgrowth.agency`, a verified domain) instead of your personal Gmail SMTP — that volume of cold mail was the actual ban risk. This covers: cold initial emails, automated follow-ups, and all campaign emails.
- Replies still route back to your Gmail inbox via `Reply-To`, so the Inbox page in the dashboard is unaffected.
- Manual, low-volume sends (meeting reminders, your own inbox replies/compose) stay on Gmail — conversational, not bulk, and they show up properly in your Gmail Sent folder.

## Campaigns feature (`/dashboard/campaigns`)
- New batch-campaign system (built concurrently, not by me, but I extended it): select contacts → stage as a draft → activate to start the AI-personalized 5-email sequence (Day 0/3/7/14/21).
- Added **"Preview Email Sequence"** on the campaign page — generates real sample emails for 2 sample leads, showing the *entire* 5-email arc (not just the first email) before you commit to activating. Click each step to expand and read it.
- Campaign/cold-call emails now actually use each lead's real website content and existing personalization research (previously this was being generated but silently ignored — emails were generic even when real info existed, e.g. one lead had a website AND a research note already in the database that the email generator never looked at).
- Fixed a parsing bug where the AI occasionally wrapped its JSON response in markdown fences, which would have silently broken email generation.

## Known existing items (not touched by me — built by another concurrent session in the same repo)
- A "Campaigns" feature and contact-batching UI were under active development in parallel. I deliberately avoided committing any of that work-in-progress under my own commits — only my own files were staged each time. Worth checking with whoever's building it on where that's at.

## Data fixes made directly in Supabase (not code — one-time)
- Bulk-corrected 52 email-outreach leads that were stuck showing as "New Lead" (they'd actually already had an email go out) — set to "Contacted".
- Deleted ~23 junk leads (newsletters, app notifications, personal contacts) that got pulled in during initial testing of the inbox-import feature before the filter was tightened.

## Where things live
- Main dashboard repo: `C:\Users\lucky\ls-growth-track` (deployed to Vercel as `ls-growth-track`, live at `app.lsgrowth.agency`)
- Marketing/landing site: `C:\Users\lucky\Desktop\lsgrowth` (separate Next.js project — `lsgrowth.agency`)
- Local Python scraper dashboard: `C:\Users\lucky\ls-growth` (run via `start_dashboard.bat`, needed for the Scraper page in the main dashboard to work — must be running locally)
- Lead scraper script: `C:\Users\lucky\lead-scraper`
