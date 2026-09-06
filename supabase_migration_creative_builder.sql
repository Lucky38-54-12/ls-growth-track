-- Drag-and-drop creative combo builder: Lucky picks one offer + one angle +
-- one hook + one style per client and gets an assembled "brief box" back,
-- which he then uses himself to actually shoot/design the creative — no AI
-- writing involved, this is a manual planning tool. Options start seeded
-- per-client from the Cleaning Creative Angle Framework doc the first time
-- that client's options are loaded (see lib/creativeBuilder.ts), then are
-- freely added/edited/deleted per client from there — never shared back
-- across clients, since one client's edits shouldn't silently change what
-- another client sees.
create table creative_builder_options (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references lq_clients(id) on delete cascade,
  category text not null check (category in ('offer', 'angle', 'hook', 'style')),
  label text not null,
  subtext text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists creative_builder_options_client_idx on creative_builder_options(client_id, category, sort_order);

-- Snapshots the picked option TEXT (not foreign keys) so a saved combo stays
-- readable and unchanged even after the option list it was built from gets
-- edited or an option gets deleted.
create table creative_builder_combos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references lq_clients(id) on delete cascade,
  service text,
  offer text,
  customer_reason text, -- why THIS customer would want this offer, e.g. "they can't easily reach some windows"
  hypothesis text, -- what we think is actually driving that, e.g. "they don't want to risk/hassle themselves"
  angle text,
  hook text,
  style text,
  notes text,
  status text not null default 'idea' check (status in ('idea', 'shooting', 'live', 'tested')),
  created_at timestamptz not null default now()
);

create index if not exists creative_builder_combos_client_idx on creative_builder_combos(client_id, created_at desc);
