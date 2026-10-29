-- Review-gating funnel: a client's past/completed-job customers get a
-- link that asks "how'd it go?" privately first. A happy answer goes
-- straight to the client's public Google review page; an unhappy one comes
-- back to the client owner privately instead, so it never reaches the
-- public profile. Framed to the end customer as "quick feedback," never as
-- "only good reviews allowed" (Google's review policies prohibit explicitly
-- discouraging negative reviews) — see app/review/[slug].
--
-- client_id is a loose link to lq_clients, not a hard dependency — this
-- funnel is meant to be reused for clients who aren't in the AI lead-qual
-- system at all, so it's nullable and only set when one happens to overlap.
create table if not exists review_funnel_clients (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references lq_clients(id) on delete set null,
  slug text unique not null,
  business_name text not null,
  owner_email text not null,
  google_review_url text not null,
  -- Optional: the client's existing Meta-leads spreadsheet (same one
  -- lead_sheet_syncs points at), so a referral lands in a "Referral Leads"
  -- tab alongside their ad leads instead of only sitting in Supabase/email.
  spreadsheet_id text,
  created_at timestamptz not null default now()
);

-- One row per batch-send to a past/completed-job customer. Nullable
-- responded_at/sentiment until they actually click through — this is what
-- "who got asked" is tracked against, separate from the response itself,
-- so a send can be logged even if the customer never responds.
create table if not exists review_funnel_sends (
  id uuid primary key default gen_random_uuid(),
  review_funnel_client_id uuid not null references review_funnel_clients(id) on delete cascade,
  customer_name text,
  customer_email text not null,
  job_description text,
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  sentiment text check (sentiment in ('good', 'bad'))
);

-- The actual answer + any private feedback text. send_id is nullable so a
-- bare /review/[slug] link (no batch send behind it) still works.
create table if not exists review_funnel_responses (
  id uuid primary key default gen_random_uuid(),
  review_funnel_client_id uuid not null references review_funnel_clients(id) on delete cascade,
  send_id uuid references review_funnel_sends(id) on delete set null,
  customer_name text,
  sentiment text not null check (sentiment in ('good', 'bad')),
  feedback text,
  created_at timestamptz not null default now()
);

create index if not exists review_funnel_sends_client_idx on review_funnel_sends(review_funnel_client_id);
create index if not exists review_funnel_responses_client_idx on review_funnel_responses(review_funnel_client_id);

-- Referral capture, offered to a happy customer right before they're sent
-- to leave a Google review (see app/review/[slug]/ReviewFlow.tsx) — they're
-- the warmest audience to ask, and it's the same page, no new send needed.
-- Always skippable, never blocks the review redirect.
create table if not exists review_funnel_referrals (
  id uuid primary key default gen_random_uuid(),
  review_funnel_client_id uuid not null references review_funnel_clients(id) on delete cascade,
  send_id uuid references review_funnel_sends(id) on delete set null,
  customer_name text,
  referral_name text not null,
  referral_contact text not null,
  created_at timestamptz not null default now()
);
create index if not exists review_funnel_referrals_client_idx on review_funnel_referrals(review_funnel_client_id);
