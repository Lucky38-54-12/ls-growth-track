-- Permanent library of every ad/creative ever seen for a client, distinct
-- from ad_learnings (which stores AI-synthesized conclusions, approval-gated)
-- and from the live Meta API pull (which only shows the current reporting
-- window and forgets an ad entirely once it's paused/deleted in Meta). This
-- table is just recorded facts, not AI judgment, so it's written directly
-- on every Creative Brain sync — no chat_drafts approval needed, same as
-- any other read-only data mirror in this app (e.g. tracked cold-call sheets).
create table ad_creatives_archive (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references lq_clients(id) on delete cascade,
  ad_id text not null,
  campaign_name text,
  title text,
  body text,
  image_url text,
  status text,
  spend numeric not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  ctr numeric not null default 0,
  cpc numeric not null default 0,
  results integer,
  cost_per_result numeric,
  result_type text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (client_id, ad_id)
);

create index if not exists ad_creatives_archive_client_idx on ad_creatives_archive(client_id, last_seen desc);
