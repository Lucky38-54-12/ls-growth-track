-- Performance Brain (on-demand campaign-level pattern detection, see
-- lib/performanceBrain.ts) proposes actions like "increase budget on
-- Campaign A" or "pause Ad 03" as chat_drafts so they go through the same
-- approval queue as everything else — but this app has no Meta Ads WRITE
-- access (read-only Graph API token, see lib/metaAds.ts), so approving a
-- recommendation here does NOT call Meta itself. It just confirms the
-- recommendation is correct; Lucky still makes the change by hand in Ads
-- Manager. Falls through to the generic "approved" branch in
-- app/api/brain/drafts/[id]/route.ts, same as any kind with no dedicated
-- apply-on-approve block.
alter table chat_drafts drop constraint if exists chat_drafts_kind_check;
alter table chat_drafts add constraint chat_drafts_kind_check
  check (kind in ('email', 'note', 'lead_update', 'calendar_booking', 'reschedule_booking', 'sheet_update', 'ad_learning', 'recommendation'));
