-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Persists /dashboard/brain chat history so it survives a page refresh and
-- old threads can be reopened, instead of living only in React state (see
-- app/dashboard/brain/BrainChat.tsx). title is set from the first user
-- message once it's sent; updated_at drives the sidebar's most-recent-first
-- ordering.
create table if not exists brain_conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists brain_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references brain_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  attachment_names text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists brain_messages_conversation_id_idx on brain_messages(conversation_id, created_at);
