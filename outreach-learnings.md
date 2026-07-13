# Outreach Learnings — Wellington Sparkies (and future campaigns)

Running log of what's been tested, what changed, and what happened. Read this before proposing a new test — don't re-test something already logged here unless the sample size was flagged too small to trust.

**How to read a sample size**: under ~15-20 opportunities (clicks for a CTA test, replies for a booking test) treat the result as directional at best, not a conclusion. Don't act on 1-3 data points.

---

## Baseline snapshot — 2026-07-13

Wellington Sparkies campaign, 76 sends (69 initial, 4 followup1, 3 followup2), all electrical trade, Wellington region.

| Stage | Sent | Reached | Rate |
|---|---|---|---|
| Sent → Opened | 69 initial | 31 | 44.9% |
| Sent → Clicked | 69 initial | 6 | 8.7% |
| Sent → Replied | 76 total | 1 | 1.3% |
| Sent → Booked | 76 total | 0 | 0% |

**followup1/followup2 sample sizes (4 and 3 sends) are far too small to read anything into yet** — flagged, not analyzed.

## Diagnosis: which funnel stage is the bottleneck

**Open rate (45%) is healthy, not the problem.** Cold B2B benchmark is 20-35%; this is well above that. Subject lines are getting emails opened.

**Click-through is the real, visible gap — and it has a clean pattern, not noise:**

Split initial sends into two groups by subject-line style:
- **Job-type-specific** subjects (e.g. "kapiti heat pumps and solar jobs", "heat pump installs and the work sitting on the table") — 11 of ~21 opened (52%), **3 clicked (14%)**
- **Generic "[Location] electricians + hook"** subjects (e.g. "Wellington electricians on Facebook", "not showing up like your competitors") — 16 of ~38 opened (42%), **0 clicked (0%)**

Similar open rates, wildly different click-through. This isn't really a subject-line-alone effect — the generic subject line was a symptom of the same root cause as generic body copy: leads with no scraped website/notes got the fully generic fallback template throughout (subject *and* body), while leads with real research got both a specific subject and a specific, grounded body. The generic group's emails just weren't compelling enough to act on once opened.

**Reply/booking stage: cannot diagnose yet.** 1 reply and 0 bookings out of 76 sends is nowhere near enough signal — could be anything from "the ask is wrong" to "conversion just takes more volume and time to build." Do not change the CTA based on this data. Revisit once total sends are past ~150-200 or clicks are past ~15-20.

**One data-quality flag**: 3 of the 4 leads that clicked *and* opened were the "not a fit" bug emails sent to Meridian Energy, Ideal Electrical, and Master Electricians (see 2026-07-13 incident below) — all larger organizations likely to run corporate email security scanners that auto-open and auto-click links before a human ever sees the email. Their 100% open+click rate is very likely bot activity, not real engagement, and should be excluded from any future analysis of what's working.

## Current bottleneck: **personalization quality → click-through**, not subject-line style or open rate in isolation

---

## Change log

### 2026-07-13 — Fixed the root cause of the generic-content group (not yet measured)
**Changed**: 
1. Banned the generic "[Location] [trade]s + hook" subject-line shape in the generation prompt (it was actively taught as a "good" example before this).
2. Added web search research for leads with no website/notes on file, so they get real, specific personalization instead of the generic fallback — same standard leads with a real website already got.

**Why**: Root-caused directly from the diagnosis above — this targets the exact gap between the two groups.

**Sample size**: 0 sends under the new prompt yet. **Not a result — a hypothesis in flight.** Next diagnosis pass should compare click-through on sends *after* this deploy against the 8.7%/0% baseline above, once there's at least ~20-30 new sends to look at.

**Next specific test queued (do not run yet)**: Once click-through data comes in on the new personalization approach and shows real lift (or doesn't), the next single-variable test is the CTA itself — every email currently uses the identical deterministic block ("case studies link" + "grab a time here"), untested against any alternative. Hold this test until clicks are past ~15-20 post-fix, so a CTA change doesn't get confounded with the personalization fix already in flight.

### 2026-07-13 — Added per-link click breakdown
**Changed**: Campaign Tracking (`/dashboard/campaign-tracking`) now has a "Link Performance" panel showing unique clickers and total clicks per distinct destination URL (case studies vs book-a-time vs anything else), instead of one collapsed "clicked" count. The underlying data already existed (`/api/click` has always stored the real destination per click event) — this was a reporting gap, not a data gap.

**Why this matters for the CTA test above**: once that test runs, "clicked case studies" vs "clicked book a time" will be the actual signal to read — a lift in case-studies clicks with no change in booking clicks means curiosity went up but the ask didn't land, which is a very different conclusion than an overall click-rate number would show.

---

## Template for future entries

```
### YYYY-MM-DD — [one-line description of the change]
**Changed**: [specific before → after, one variable]
**Why**: [what data motivated this]
**Sample size**: [n opportunities, e.g. "23 clicks over 2 weeks"]
**Result**: [rate before vs after, and whether it's large enough to trust]
**Conclusion**: [keep it / revert it / inconclusive, need more volume]
```
