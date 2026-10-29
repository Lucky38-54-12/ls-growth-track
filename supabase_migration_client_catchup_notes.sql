-- Freeform notes tied to a client ("need to ask them about X"), jotted down
-- whenever something comes up — not scoped to a single catch-up. Unresolved
-- notes get pulled into both the mid-month and end-of-month prep emails
-- (lib/clientCatchupPrep.ts) so Lucky actually remembers to bring them up on
-- the call, instead of needing to recall them from memory.
create table if not exists client_catchup_notes (
  id uuid primary key default gen_random_uuid(),
  lead_sheet_sync_id uuid not null references lead_sheet_syncs(id) on delete cascade,
  note text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists client_catchup_notes_sync_idx on client_catchup_notes(lead_sheet_sync_id);
