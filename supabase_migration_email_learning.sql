-- Lets opens/clicks be traced back to the exact email (lead_id + step) they
-- came from instead of just the lead as a whole, and stores the AI's
-- synthesized "what's working" guidance from real send performance.
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS step text;

CREATE TABLE IF NOT EXISTS email_learnings (
  id bigserial PRIMARY KEY,
  guidance text NOT NULL,
  based_on_sends int NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_learnings ENABLE ROW LEVEL SECURITY;
