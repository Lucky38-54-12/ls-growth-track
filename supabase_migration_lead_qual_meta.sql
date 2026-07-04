-- Adds Meta message dedup, and the Page Access Token storage that
-- lq_channels was missing from the original migration.
alter table lq_messages add column if not exists meta_message_id text;
create unique index if not exists lq_messages_meta_message_id_idx on lq_messages (meta_message_id) where meta_message_id is not null;
alter table lq_channels add column if not exists credentials bytea;
