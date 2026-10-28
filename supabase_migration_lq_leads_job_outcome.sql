-- Tracks whether a qualified lead actually turned into a paying job for the
-- client, not just "booking_status=booked" (which only means a callback/
-- meeting got booked) or "pipeline_stage=booked_job" (a client-draggable
-- Kanban label with nothing behind it). Feeds the weekly client check-in
-- (lib/weeklyCheckin.ts) and lets job value be sliced against the job_type
-- already captured in lq_conversations.extracted_fields.
alter table lq_leads add column if not exists job_value numeric;
alter table lq_leads add column if not exists job_won_at timestamptz;
alter table lq_leads add column if not exists job_lost_reason text;

-- How many weekly check-in emails this lead has been included in with no
-- outcome reported yet — used to flag it internally (Slack) after 2 nudges
-- instead of nudging forever.
alter table lq_leads add column if not exists checkin_nudges_sent int not null default 0;
