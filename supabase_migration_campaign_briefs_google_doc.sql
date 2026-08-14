-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Each client gets one persistent "master doc" in Google Docs — created on
-- first campaign_brief generation, then appended to (not replaced) on every
-- regeneration, so later stages (ad copy, landing page notes, etc) can build
-- into the same file instead of scattering across separate docs.
alter table campaign_briefs
  add column google_doc_id text,
  add column google_doc_url text;
