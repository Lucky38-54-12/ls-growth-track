-- Staging table for Facebook Pages auto-discovered on the Business Manager
-- (via META_SYSTEM_USER_TOKEN) that aren't yet connected to a client's
-- lq_channels row. unique(external_page_id) is what stops the daily
-- discovery job from re-surfacing a Page that's already been confirmed or
-- dismissed on a previous run.
create table lq_facebook_discovered_pages (
  id uuid primary key default gen_random_uuid(),
  external_page_id text not null unique,
  page_name text not null,
  suggested_client_id uuid references lq_clients(id),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'dismissed')),
  confirmed_client_id uuid references lq_clients(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
