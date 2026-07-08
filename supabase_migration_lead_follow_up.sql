-- Lets a lead be "snoozed" to a specific future date (e.g. "he's booked out
-- until September, follow up then") instead of the note just sitting there
-- with nothing to actually surface it later. Surfaced on the Today page.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_at date;
