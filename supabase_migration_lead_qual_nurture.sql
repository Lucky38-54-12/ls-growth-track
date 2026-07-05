-- Nurture email pipeline: anchor scheduling to when the lead was enrolled,
-- and surface the lead's email directly on lq_leads for the dashboard leads
-- list regardless of outcome (not just nurture leads).
alter table lq_nurture_enrollments add column if not exists enrolled_at timestamptz not null default now();
alter table lq_leads add column if not exists contact_email text;
