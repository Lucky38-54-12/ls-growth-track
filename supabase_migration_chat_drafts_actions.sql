-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Adds a generic, machine-executable payload column to chat_drafts so future
-- Brain actions (beyond email) reuse the same table and approve/reject flow
-- instead of getting their own table each time. First consumer: kind
-- 'lead_update', which stores a validated {status?, notes?, follow_up_at?}
-- object here — content stays the human-readable summary shown in the
-- approval UI, payload is what actually gets applied to the leads row on
-- approval (see app/api/brain/drafts/[id]/route.ts).
alter table chat_drafts add column if not exists payload jsonb;

alter table chat_drafts drop constraint if exists chat_drafts_kind_check;
alter table chat_drafts add constraint chat_drafts_kind_check check (kind in ('email', 'note', 'lead_update'));

-- 'applied' is the lead_update equivalent of the email kind's 'sent' — the
-- action was actually executed, not just approved-but-unactioned.
alter table chat_drafts drop constraint if exists chat_drafts_status_check;
alter table chat_drafts add constraint chat_drafts_status_check check (status in ('pending', 'approved', 'rejected', 'sent', 'applied'));
