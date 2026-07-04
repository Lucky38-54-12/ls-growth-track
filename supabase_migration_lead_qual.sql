-- AI Lead Qualification feature: Meta ad leads get an AI qualifying
-- conversation, qualified ones book straight onto the client's own Google
-- Calendar + text them the job details, others go into an email nurture
-- sequence. No client login — LS Growth staff manage everything from this
-- dashboard. Tables prefixed lq_ to avoid clashing with the existing `leads`
-- table (LS Growth's own cold-outreach pipeline — a different thing).

create table lq_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trade text,
  timezone text not null default 'Pacific/Auckland',
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  phone text,
  created_at timestamptz not null default now()
);

-- Per-client Google Calendar OAuth connection (one-time "connect your
-- calendar" flow). refresh_token is encrypted at rest — never returned to
-- the client bundle.
create table lq_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references lq_clients(id) on delete cascade unique,
  google_account_email text,
  calendar_id text not null default 'primary',
  encrypted_refresh_token bytea not null,
  connected_at timestamptz not null default now()
);

create table lq_client_configs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references lq_clients(id) on delete cascade,
  version int not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  business_info jsonb not null default '{}',
  services jsonb not null default '[]',
  service_areas jsonb not null default '[]',
  faqs jsonb not null default '[]',
  qualification_rules jsonb not null default '[]',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id, version)
);

create table lq_channels (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references lq_clients(id) on delete cascade,
  type text not null check (type in ('messenger', 'instagram', 'leadads')),
  external_page_id text not null,
  created_at timestamptz not null default now(),
  unique (type, external_page_id)
);

create table lq_conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references lq_clients(id) on delete cascade,
  channel_id uuid references lq_channels(id) on delete set null,
  contact jsonb not null default '{}',
  status text not null default 'active'
    check (status in ('active', 'qualified', 'nurturing', 'disqualified', 'needs_human', 'closed')),
  extracted_fields jsonb not null default '{}',
  started_at timestamptz not null default now()
);

create table lq_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references lq_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  structured_output jsonb,
  created_at timestamptz not null default now()
);

create table lq_leads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references lq_conversations(id) on delete cascade,
  client_id uuid not null references lq_clients(id) on delete cascade,
  outcome text not null check (outcome in ('qualified', 'nurture', 'disqualified')),
  score numeric,
  booking_status text default 'pending' check (booking_status in ('pending', 'booked', 'failed', 'not_applicable')),
  calendar_event_id text,
  booked_at timestamptz,
  sms_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table lq_nurture_sequences (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references lq_clients(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  steps jsonb not null default '[]'
);

create table lq_nurture_enrollments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references lq_leads(id) on delete cascade,
  client_id uuid not null references lq_clients(id) on delete cascade,
  sequence_id uuid not null references lq_nurture_sequences(id) on delete cascade,
  current_step int not null default 0,
  status text not null default 'active' check (status in ('active', 'booked', 'completed', 'stopped')),
  next_send_at timestamptz,
  contact_email text
);
