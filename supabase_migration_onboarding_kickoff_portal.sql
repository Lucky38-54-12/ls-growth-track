-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

alter table onboarding_clients
  add column if not exists business_manager_id text,
  add column if not exists portal_photos_folder_url text,
  add column if not exists client_intake_submitted_at timestamptz,
  add column if not exists kickoff_email_status text not null default 'none' check (kickoff_email_status in ('none', 'pending', 'sent')),
  add column if not exists kickoff_email_subject text,
  add column if not exists kickoff_email_html text,
  add column if not exists kickoff_email_sent_at timestamptz;
