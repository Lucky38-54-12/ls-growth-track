-- The kind check constraint was last widened in
-- supabase_migration_chat_drafts_actions_2.sql (email, note, lead_update,
-- calendar_booking, sheet_update) but two real kinds the app has since
-- started inserting into chat_drafts were never added here:
-- reschedule_booking (app/api/brain/chat/route.ts) has been silently
-- failing at the DB layer ever since it was introduced, and ad_learning
-- (the Lead Generation Intelligence System's approval-gated learning
-- store) needs it now. script_proposal/agreement_doc/log_call/call_prep/
-- campaign_brief/regenerate_ads are deliberately NOT here — those apply
-- immediately and write to their own tables, never to chat_drafts.
alter table chat_drafts drop constraint if exists chat_drafts_kind_check;
alter table chat_drafts add constraint chat_drafts_kind_check
  check (kind in ('email', 'note', 'lead_update', 'calendar_booking', 'reschedule_booking', 'sheet_update', 'ad_learning'));
