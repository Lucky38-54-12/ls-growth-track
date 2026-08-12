-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Drafts produced by the /dashboard/brain chat (see app/api/brain/chat) —
-- when the AI proposes an email or note instead of just answering, it lands
-- here as "pending" for Lucky to approve or reject, same pattern as
-- sales_script_proposals. Approving an "email" draft with a lead_id sends it
-- through the real follow-up-email pipeline; anything else just gets marked
-- approved for Lucky to action manually.
create table if not exists chat_drafts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('email', 'note')),
  title text not null default '',
  lead_id uuid references leads(id) on delete set null,
  content text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'sent')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
