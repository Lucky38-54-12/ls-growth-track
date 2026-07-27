-- The client's own contact email, used to notify them directly when a lead
-- gets booked onto their calendar via the AI qualifier (job details, lead's
-- phone, booked time) — separate from their Google account email captured
-- in lq_calendar_connections, which is only used to display connection
-- status, not for sending anything. Applied directly to the live project.
alter table lq_clients add column if not exists email text;
