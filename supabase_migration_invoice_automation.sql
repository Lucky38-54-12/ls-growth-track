-- Invoice automation: when a client's payment comes due, a Google Doc
-- invoice is generated automatically and a "ready to send" email is queued
-- for Lucky to review and send himself from /dashboard/payments (never
-- auto-sent to the client — see feedback_brain_approval_gate memory, every
-- automated action here stays behind a human click).
alter table lq_clients
  add column if not exists last_invoice_drafted_due_date date,
  add column if not exists pending_invoice_doc_url text,
  add column if not exists pending_invoice_tone text; -- 'overdue' | 'simple'
