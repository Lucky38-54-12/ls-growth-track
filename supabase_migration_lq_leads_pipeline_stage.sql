alter table lq_leads add column if not exists pipeline_stage text;

update lq_leads set pipeline_stage = case
  when outcome = 'disqualified' then 'not_a_fit'
  when outcome = 'nurture' then 'not_ready'
  when outcome = 'qualified' and booking_status = 'booked' then 'booked'
  else 'new_inquiry'
end
where pipeline_stage is null;
