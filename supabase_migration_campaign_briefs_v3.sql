-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Adds "Ad Concepts" — 3 Meta ad ideas (angle/headline/primaryText/
-- creativeDirection/targeting each) generated off an already-confirmed
-- Stage 01 brief via lib/campaignAds.ts. Always regenerated as a full set
-- of 3, so this is one jsonb array column rather than a new table (same
-- reasoning as doc_markdown already being one blob on this row).
alter table campaign_briefs add column ad_concepts jsonb not null default '[]';
