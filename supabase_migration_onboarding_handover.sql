-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Backs the "client signed & closed" handover button on the onboarding
-- client detail page: pushes a marketing brief doc + notification email to
-- harris@lsgrowth.agency, plus creates the client's Drive folder (photos)
-- and leads-tracking Sheet (Meta lead ads results, scanned daily by Lucky
-- as appointment setter).
alter table onboarding_clients
  add column if not exists handover_status text not null default 'none' check (handover_status in ('none', 'sent', 'failed')),
  add column if not exists handover_doc_url text,
  add column if not exists handover_sent_at timestamptz,
  add column if not exists client_drive_folder_url text,
  add column if not exists leads_sheet_url text,
  add column if not exists handover_checklist_steps text[] not null default '{}',
  add column if not exists client_folder_url text;

comment on column onboarding_clients.client_folder_url is 'Parent Drive folder for this client (holds the Photos & Videos subfolder, handover doc, and leads sheet) — shared with marketing (Harris). client_drive_folder_url is the Photos & Videos subfolder inside it, shared with the client separately once ready.';
