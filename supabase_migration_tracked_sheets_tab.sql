-- Run this once in Supabase Dashboard → SQL Editor → New query → Run
-- Lets one tracked_sheets row target a specific tab inside a workbook that
-- has several (e.g. a single "Cleaning" spreadsheet with one tab per city),
-- instead of only ever reading whichever tab the Sheets API treats as
-- default. Multiple tabs from the same spreadsheet can now each be tracked
-- as their own row.

alter table tracked_sheets add column if not exists tab text;

-- sheet_id alone used to be unique (one row per spreadsheet). Replace that
-- with (sheet_id, tab) so the same spreadsheet can have one tracked row per
-- tab, while still blocking a true duplicate (same sheet_id, same tab, or
-- both NULL tab for a plain single-tab sheet).
alter table tracked_sheets drop constraint if exists tracked_sheets_sheet_id_key;
create unique index if not exists tracked_sheets_sheet_id_tab_key on tracked_sheets (sheet_id, coalesce(tab, ''));
