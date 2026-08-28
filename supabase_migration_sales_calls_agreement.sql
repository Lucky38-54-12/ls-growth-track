-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

alter table sales_calls
  add column if not exists deal_agreed boolean not null default false,
  add column if not exists deal_terms text,
  add column if not exists agreement_status text not null default 'none' check (agreement_status in ('none', 'generated', 'failed')),
  add column if not exists agreement_doc_url text;
