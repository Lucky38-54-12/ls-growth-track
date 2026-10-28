-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql
-- Second call after contract sign-off (discovery call -> contract -> onboarding call),
-- where expectations get set and confirmed in writing afterward.

alter table onboarding_clients
  add column if not exists trade text,
  add column if not exists first_review_date date,
  add column if not exists campaign_start_date date,
  add column if not exists checkin_schedule_note text, -- free-text day/time agreed on the call, not an automated scheduler
  add column if not exists creatives_received_at timestamptz,
  add column if not exists onboarding_call_notes text,
  add column if not exists onboarding_call_completed_at timestamptz,
  add column if not exists onboarding_recap_status text not null default 'none' check (onboarding_recap_status in ('none', 'pending', 'sent')),
  add column if not exists onboarding_recap_subject text,
  add column if not exists onboarding_recap_html text,
  add column if not exists onboarding_recap_sent_at timestamptz;
