-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Tightens Stage 01 (see supabase_migration_campaign_briefs.sql) from 11
-- long essay fields down to 3 primary checklist fields (matching LS
-- Growth's actual "Offer + pricing confirmed / Ideal customer defined /
-- Budget + targeting set" process) plus 4 shorter supporting-research
-- fields. main_service and service_area fold into offer_pricing and
-- ideal_customer respectively; objective/budget/targeting_approach fold
-- into the new budget_targeting column. Existing rows are test data only —
-- no backfill.
alter table campaign_briefs add column budget_targeting text not null default '';
alter table campaign_briefs drop column main_service;
alter table campaign_briefs drop column service_area;
alter table campaign_briefs drop column objective;
alter table campaign_briefs drop column budget;
alter table campaign_briefs drop column targeting_approach;
