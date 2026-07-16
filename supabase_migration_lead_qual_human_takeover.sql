-- When a staff member replies to a lead directly in the Facebook Page inbox
-- (instead of through this dashboard), the AI must stop replying to that
-- conversation — otherwise it talks over the human. paused_at marks that a
-- human has taken over; while set, runTurn() logs inbound messages but never
-- generates or sends an AI reply for that conversation.
alter table lq_conversations add column if not exists paused_at timestamptz;

alter table lq_messages drop constraint if exists lq_messages_role_check;
alter table lq_messages add constraint lq_messages_role_check
  check (role in ('user', 'assistant', 'system', 'staff'));
