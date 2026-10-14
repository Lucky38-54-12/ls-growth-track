-- Run this once in Supabase Dashboard → SQL Editor → New query → Run
-- Lets the new /api/webhooks/resend route trace a Resend delivery/bounce/
-- complaint event back to the exact email_sends row it belongs to, and
-- record what actually happened to it. Resend's own dashboard only shows
-- events for 7 days, so this is the durable record.

alter table email_sends
  add column if not exists resend_id text,
  add column if not exists delivery_status text not null default 'sent',
  add column if not exists status_updated_at timestamptz;

create index if not exists email_sends_resend_id_idx on email_sends (resend_id);
