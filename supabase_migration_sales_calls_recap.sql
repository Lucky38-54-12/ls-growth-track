-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

alter table sales_calls
  add column if not exists recap_sent_at timestamptz,
  add column if not exists recap_recipient text,
  add column if not exists recap_status text not null default 'none' check (recap_status in ('none', 'pending', 'sent')),
  add column if not exists recap_subject text,
  add column if not exists recap_html text;
