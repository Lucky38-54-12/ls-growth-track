-- Run this once in Supabase Dashboard → SQL Editor → New query → Run
-- Logs every AI quality-gate verdict for a generated campaign email, so
-- nothing sends without a check and nothing gets lost (this table is also
-- what the local Obsidian sync script reads from).

CREATE TABLE IF NOT EXISTS email_checks (
  id bigserial PRIMARY KEY,
  lead_id text NOT NULL,
  step text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('approved', 'rejected')),
  mechanical_fails jsonb NOT NULL DEFAULT '[]',
  judgment_flags jsonb NOT NULL DEFAULT '[]',
  reasoning text,
  sent boolean NOT NULL DEFAULT false,
  synced_to_obsidian boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_checks_lead_id_idx ON email_checks (lead_id);
CREATE INDEX IF NOT EXISTS email_checks_unsynced_idx ON email_checks (synced_to_obsidian) WHERE synced_to_obsidian = false;
