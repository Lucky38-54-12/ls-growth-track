-- Client's logo, pulled automatically from their connected Facebook Page
-- profile picture (see connectMessengerPage in lib/leadQual/meta.ts) rather
-- than requiring anyone to upload one by hand.
alter table lq_clients add column if not exists logo_url text;
