-- Facebook Page self-connect flow: after the OAuth callback, we briefly
-- stash the list of Pages the user manages (with each Page's own access
-- token) so the dashboard can show a picker before committing to one. Rows
-- are deleted immediately once a page is chosen, or become stale/ignorable
-- after a short window if abandoned.
create table lq_pending_facebook_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references lq_clients(id) on delete cascade,
  pages jsonb not null,
  created_at timestamptz not null default now()
);
