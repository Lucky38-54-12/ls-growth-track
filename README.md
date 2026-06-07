# LS Growth — Tracking endpoints

Two tiny Vercel serverless functions used by the LS Growth outreach sender to
record email opens and link clicks per lead.

- `GET /api/open?id=<lead_id>` — returns a 1x1 transparent pixel, logs an `open` event
- `GET /api/click?id=<lead_id>&url=<encoded target url>` — logs a `click` event, then redirects to `url`

Events are written to a Supabase table called `email_events`:

```sql
create table email_events (
  id bigint generated always as identity primary key,
  lead_id text not null,
  event_type text not null check (event_type in ('open', 'click')),
  url text,
  created_at timestamptz not null default now()
);

create index email_events_lead_id_idx on email_events (lead_id);
```

## Setup

1. Create (or reuse) a Supabase project and run the SQL above in the SQL editor.
2. Copy `.env.example` to `.env` and fill in `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API). The service role key
   is required because these functions write from the server side.
3. Push this folder to a new GitHub repo and import it into Vercel (same flow
   as Club HQ — connect the repo, Vercel auto-detects the `api/` functions).
4. In the Vercel project settings, add `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` as environment variables.
5. Note the deployed domain (e.g. `https://ls-growth-track.vercel.app`) — the
   outreach sender (`send.py` in `ls-growth/`) needs this to build tracking
   links.

## Local testing

```
npm install
npx vercel dev
```
